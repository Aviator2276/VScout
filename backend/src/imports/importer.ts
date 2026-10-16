// Import jobs (REQUIREMENTS §11). Every record is compared by content hash first, so a re-import of
// unchanged data bumps no revision and publishes nothing. Each job commits as one `import` batch,
// which the MQTT publisher collapses into a `control resync` when it touches more than 50 records.
import type { Bus } from "../domain/bus.js"
import type { AllianceBoard } from "../domain/board.js"
import type { EntityName, Rec } from "../domain/entities.js"
import type { Settings } from "../domain/settings.js"
import type { Store } from "../domain/store.js"
import type { Db } from "../db/db.js"
import type { Clock } from "../lib/clock.js"
import { iso } from "../lib/clock.js"
import { contentHash } from "../lib/json.js"
import type { CachedFetcher } from "./http-cache.js"
import { SourceError } from "./http-cache.js"
import { NexusClient, mapNexusStatus, matchKeyForLabel, nexusEventSchema, nexusMatchPart, parsePits } from "./nexus.js"
import { parseNexusMap, renderSvg } from "./pit-map.js"
import { TbaClient, mapEvent, mapMatch, mapRankings, mapTeam } from "./tba.js"

export const STATBOTICS_BASE = "https://api.statbotics.io/v3"

const TBA_MATCH_FIELDS = [
  "eventKey",
  "compLevel",
  "setNumber",
  "matchNumber",
  "scheduledTime",
  "tbaPredictedTime",
  "actualTime",
  "postResultTime",
  "alliances",
  "winningAlliance",
  "scoreBreakdown",
  "videoKeys",
  "resultPosted",
]
const NEXUS_MATCH_FIELDS = ["predictedTime", "predictedAt", "nexusStatus", "queueTimes"]

const pick = (o: Record<string, unknown> | undefined, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => o && k in o).map((k) => [k, o?.[k]]))

export interface PitMapView {
  rev: number
  width: number
  height: number
  pits: Array<{ teamNumber: number; x: number; y: number; w: number; h: number }>
  svg: string
}

export interface ImporterOptions {
  tbaKey?: string | undefined
  nexusKey?: string | undefined
  statbotics: boolean
  gameIdsByYear: Record<string, string>
  activeGameId: string
}

export type ImportJob = "event" | "matches" | "rankings" | "statbotics" | "nexus" | "pits" | "pitMap"

export class Importer {
  readonly tba: TbaClient | null
  readonly nexus: NexusClient | null
  private nexusAsOf = new Map<string, number>()
  private lastAlert = new Map<string, number>()
  readonly health = new Map<string, { ok: boolean; at: number; message?: string }>()

  constructor(
    private db: Db,
    private store: Store,
    private settings: Settings,
    private board: AllianceBoard,
    private bus: Bus,
    private http: CachedFetcher,
    private clock: Clock,
    private opts: ImporterOptions,
    private log: (msg: string, data?: Record<string, unknown>) => void = () => {}
  ) {
    this.tba = opts.tbaKey ? new TbaClient(http, opts.tbaKey) : null
    this.nexus = opts.nexusKey ? new NexusClient(http, opts.nexusKey) : null
  }

  nexusDataAsOf = (eventKey: string): number | undefined => this.nexusAsOf.get(eventKey)

  // ---- tracked events ------------------------------------------------------------------------

  trackedEvents(): Array<{ eventKey: string; live: boolean; addedAt: number }> {
    return this.db
      .all<{ event_key: string; live: number; added_at: number }>("SELECT * FROM tracked_events ORDER BY event_key")
      .map((r) => ({ eventKey: r.event_key, live: r.live === 1, addedAt: r.added_at }))
  }

  liveEvents = (): string[] => this.trackedEvents().filter((e) => e.live).map((e) => e.eventKey)

  track(eventKey: string, live = true) {
    this.db.run(
      `INSERT INTO tracked_events (event_key, live, added_at) VALUES (?, ?, ?)
       ON CONFLICT(event_key) DO UPDATE SET live = excluded.live`,
      eventKey,
      live ? 1 : 0,
      this.clock.now()
    )
  }

  untrack(eventKey: string) {
    this.db.run("DELETE FROM tracked_events WHERE event_key = ?", eventKey)
  }

  // ---- records -----------------------------------------------------------------------------

  /** Upserts a server-owned record only when its content changed. Must run inside store.tx. */
  private upsertRef(entity: EntityName, data: Record<string, unknown> & { id: string }): boolean {
    const hash = contentHash(data)
    const existing = this.store.get(entity, data.id)
    if (existing && !existing.deleted && existing.contentHash === hash) return false
    const rec: Rec = { ...data, rev: (existing?.rev ?? 0) + 1, updatedAt: iso(this.clock.now()) }
    this.store.put(entity, rec, { contentHash: hash, source: "import" })
    return true
  }

  /** A manual event for when TBA has none (offseason scrimmages) or no TBA key is configured. */
  createManualEvent(input: { eventKey: string; name: string; startDate: string; endDate: string; timezone?: string | undefined; year?: number | undefined }) {
    const year = input.year ?? Number(input.eventKey.slice(0, 4))
    this.store.tx(
      () =>
        this.upsertRef("event", {
          id: input.eventKey,
          name: input.name,
          year,
          gameId: this.opts.gameIdsByYear[String(year)] ?? this.opts.activeGameId,
          eventType: "offseason",
          startDate: input.startDate,
          endDate: input.endDate,
          timezone: input.timezone ?? "UTC",
          manual: true,
        }),
      { source: "import" }
    )
    this.settings.ensureEventSingletons(input.eventKey)
  }

  private fail(job: string, eventKey: string, e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    this.health.set(`${eventKey}:${job}`, { ok: false, at: this.clock.now(), message })
    this.log(`import ${job} failed for ${eventKey}: ${message}`)
    const key = `${eventKey}:${job}`
    const last = this.lastAlert.get(key) ?? 0
    if (this.clock.now() - last > 10 * 60_000) {
      this.lastAlert.set(key, this.clock.now())
      this.bus.emit("alert", {
        eventKey,
        kind: "importFailed",
        message: `${job} import failed`,
        detail: { job, status: e instanceof SourceError ? e.status : null, error: message.slice(0, 300) },
      })
    }
  }

  async run(job: ImportJob, eventKey: string): Promise<number> {
    try {
      const n = await this.dispatch(job, eventKey)
      this.health.set(`${eventKey}:${job}`, { ok: true, at: this.clock.now() })
      return n
    } catch (e) {
      this.fail(job, eventKey, e)
      return 0
    }
  }

  private dispatch(job: ImportJob, ek: string): Promise<number> {
    switch (job) {
      case "event":
        return this.importEvent(ek)
      case "matches":
        return this.importMatches(ek)
      case "rankings":
        return this.importRankings(ek)
      case "statbotics":
        return this.importStatbotics(ek)
      case "nexus":
        return this.importNexus(ek)
      case "pits":
        return this.importPits(ek)
      case "pitMap":
        return this.importPitMap(ek)
    }
  }

  /** Everything for one event, in dependency order (setup, admin "import now"). */
  async full(eventKey: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {}
    for (const job of ["event", "matches", "rankings", "statbotics", "nexus", "pits", "pitMap"] as const) {
      if (!this.available(job)) continue
      out[job] = await this.run(job, eventKey)
    }
    if (this.store.live("event", eventKey)) this.settings.ensureEventSingletons(eventKey)
    return out
  }

  available(job: ImportJob): boolean {
    if (job === "statbotics") return this.opts.statbotics
    if (job === "nexus" || job === "pits" || job === "pitMap") return this.nexus !== null
    return this.tba !== null
  }

  // ---- TBA ---------------------------------------------------------------------------------

  async importEvent(ek: string): Promise<number> {
    if (!this.tba) return 0
    const [event, teams] = await Promise.all([this.tba.event(ek), this.tba.teams(ek)])
    let changed = 0
    this.store.tx(
      () => {
        if (this.upsertRef("event", mapEvent(event.body, this.opts.gameIdsByYear, this.opts.activeGameId) as Rec)) changed++
        for (const t of teams.body ?? []) {
          if (this.upsertRef("team", mapTeam(t) as Rec)) changed++
          if (this.upsertEventTeam(ek, t.team_number, {})) changed++
        }
      },
      { source: "import" }
    )
    this.settings.ensureEventSingletons(ek)
    return changed
  }

  private upsertEventTeam(ek: string, team: number, part: Record<string, unknown>): boolean {
    const id = `${ek}_${team}`
    const existing = this.store.get("eventTeam", id)
    const base = existing && !existing.deleted ? existing.data : undefined
    const { rev: _rev, updatedAt: _u, ...prev } = base ?? ({} as Record<string, unknown>)
    const data = {
      rank: null,
      record: null,
      rankingPoints: null,
      pitLocation: null,
      stats: {},
      statsUpdatedAt: null,
      ...prev,
      ...part,
      id,
      eventKey: ek,
      teamNumber: team,
    }
    return this.upsertRef("eventTeam", data)
  }

  private composeMatch(id: string, tbaPart: Record<string, unknown> | null, nexusPart: Record<string, unknown> | null): Record<string, unknown> & { id: string } {
    const existing = this.store.live("match", id)
    const tba = tbaPart ?? pick(existing, TBA_MATCH_FIELDS)
    const nexus = nexusPart ?? pick(existing, NEXUS_MATCH_FIELDS)
    let status: string
    if (tba.resultPosted === true) status = "played"
    else {
      const mapped = mapNexusStatus(nexus.nexusStatus as string | null | undefined)
      status = mapped ?? (existing && existing.status !== "played" ? String(existing.status) : "scheduled")
    }
    return {
      predictedTime: null,
      predictedAt: null,
      ...tba,
      ...nexus,
      id,
      status,
    } as Record<string, unknown> & { id: string }
  }

  async importMatches(ek: string): Promise<number> {
    if (!this.tba) return 0
    const res = await this.tba.matches(ek)
    if (!res.changed && this.store.listLive("match", ek).length) return 0
    let changed = 0
    this.store.tx(
      () => {
        for (const m of res.body ?? []) {
          const part = mapMatch(m)
          if (!part) continue
          const { played, ...rest } = part
          const tbaPart = { ...rest, resultPosted: played === true }
          delete (tbaPart as Record<string, unknown>).id
          if (this.upsertRef("match", this.composeMatch(m.key, tbaPart, null))) changed++
        }
      },
      { source: "import" }
    )
    return changed
  }

  async importRankings(ek: string): Promise<number> {
    if (!this.tba) return 0
    const res = await this.tba.rankings(ek)
    if (!res.body) return 0
    const ranks = mapRankings(res.body)
    let changed = 0
    this.store.tx(
      () => {
        for (const [team, r] of ranks)
          if (
            this.upsertEventTeam(ek, team, {
              rank: r.rank,
              record: r.record,
              rankingPoints: r.rankingPoints,
              tbaRanking: r.ranking,
            })
          )
            changed++
      },
      { source: "import" }
    )
    if (changed) this.board.refreshCaptains(ek)
    return changed
  }

  // ---- Statbotics ---------------------------------------------------------------------------

  async importStatbotics(ek: string): Promise<number> {
    if (!this.opts.statbotics) return 0
    const res = await this.http.getJson<unknown>("Statbotics", `${STATBOTICS_BASE}/team_events?event=${encodeURIComponent(ek)}&limit=1000`, {})
    const rows = Array.isArray(res.body) ? (res.body as Array<Record<string, unknown>>) : []
    let changed = 0
    this.store.tx(
      () => {
        for (const row of rows) {
          const team = Number(row.team)
          if (!Number.isInteger(team) || team <= 0) continue
          const id = `${ek}_${team}`
          const existing = this.store.live("eventTeam", id)
          if (existing && contentHash(existing.stats) === contentHash(row)) continue
          if (this.upsertEventTeam(ek, team, { stats: row, statsUpdatedAt: iso(this.clock.now()) })) changed++
        }
      },
      { source: "import" }
    )
    return changed
  }

  // ---- Nexus ----------------------------------------------------------------------------------

  async importNexus(ek: string): Promise<number> {
    if (!this.nexus) return 0
    const res = await this.nexus.event(ek)
    const parsed = nexusEventSchema.safeParse(res.body)
    if (!parsed.success) throw new Error(`Nexus event response didn't match the expected shape: ${parsed.error.issues[0]?.message ?? ""}`)
    const data = parsed.data
    this.nexusAsOf.set(ek, data.dataAsOfTime)
    const asOf = iso(data.dataAsOfTime)
    const now = this.clock.now()
    const unknownStatuses = new Set<string>()
    const unknownLabels: string[] = []
    let changed = 0
    this.store.tx(
      () => {
        for (const m of data.matches) {
          const key = matchKeyForLabel(ek, m.label)
          if (!key) {
            if (!/^practice/i.test(m.label)) unknownLabels.push(m.label)
            continue
          }
          const existing = this.store.live("match", key)
          if (!existing) continue
          const part = nexusMatchPart(m)
          if (m.status && mapNexusStatus(m.status) === undefined) unknownStatuses.add(m.status)
          // predictedAt moves only when the estimate moves, or to keep a near match's estimate
          // fresh for the app (it trusts estimates for 15 minutes); otherwise every 30 s poll
          // would bump every match's rev
          const predicted = part.predictedTime as string | null
          let predictedAt = (existing.predictedAt as string | null | undefined) ?? null
          if (!predicted) predictedAt = null
          else if (predicted !== existing.predictedTime || !predictedAt) predictedAt = asOf
          else {
            const age = now - Date.parse(predictedAt)
            const soon = Date.parse(predicted) - now < 60 * 60_000
            if (soon && age > 10 * 60_000) predictedAt = asOf
          }
          if (this.upsertRef("match", this.composeMatch(key, null, { ...part, predictedAt }))) changed++
        }
      },
      { source: "import" }
    )
    if (unknownStatuses.size || unknownLabels.length)
      this.bus.emit("alert", {
        eventKey: ek,
        kind: "importUnknownValue",
        message: "Nexus sent values the server doesn't recognize; they are kept raw",
        detail: { statuses: [...unknownStatuses], labels: unknownLabels.slice(0, 10) },
      })
    return changed
  }

  async importPits(ek: string): Promise<number> {
    if (!this.nexus) return 0
    const res = await this.nexus.pits(ek)
    const pits = parsePits(res.body)
    let changed = 0
    this.store.tx(
      () => {
        for (const [team, pit] of pits) {
          const id = `${ek}_${team}`
          const existing = this.store.live("eventTeam", id)
          if (existing?.pitLocation === pit) continue
          if (this.upsertEventTeam(ek, team, { pitLocation: pit })) changed++
        }
      },
      { source: "import" }
    )
    if (changed) await this.run("pitMap", ek).catch(() => 0)
    return changed
  }

  async importPitMap(ek: string): Promise<number> {
    if (!this.nexus) return 0
    const res = await this.nexus.map(ek)
    const map = parseNexusMap(res.body)
    if (!map) throw new Error("Nexus map has no pits the server could read")
    const teamsByPit = new Map<string, number>()
    for (const et of this.store.listLive("eventTeam", ek))
      if (typeof et.pitLocation === "string") teamsByPit.set(et.pitLocation, Number(et.teamNumber))
    const pits = [...map.pits]
      .flatMap(([addr, r]) => {
        const team = teamsByPit.get(addr)
        return team ? [{ teamNumber: team, x: r.x, y: r.y, w: r.w, h: r.h }] : []
      })
      .slice(0, 200)
    const svg = renderSvg(map, teamsByPit)
    const hash = contentHash({ svg, pits })
    const prev = this.pitMap(ek)
    if (prev && prev.hash === hash) return 0
    const view = { rev: (prev?.rev ?? 0) + 1, hash, width: map.width, height: map.height, pits, svg }
    this.db.setMeta(`pitmap:${ek}`, JSON.stringify(view))
    return 1
  }

  pitMap(ek: string): (PitMapView & { hash: string }) | undefined {
    const raw = this.db.getMeta(`pitmap:${ek}`)
    return raw ? (JSON.parse(raw) as PitMapView & { hash: string }) : undefined
  }
}
