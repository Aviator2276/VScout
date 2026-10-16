// "Match coming up" (REQUIREMENTS §10.3): only from a live FRC Nexus estimate updated less than five
// minutes ago, never from the schedule; once per (user, match).
import type { Rec } from "../domain/entities.js"
import type { Settings } from "../domain/settings.js"
import type { Store } from "../domain/store.js"
import type { Users } from "../domain/users.js"
import type { Clock } from "../lib/clock.js"
import type { PushService } from "./push-service.js"
import { prefsOf } from "./push-service.js"

export const NEXUS_FRESH_MS = 5 * 60_000

const LEVEL_NAMES: Record<string, string> = { qm: "Qual", ef: "Eighth", qf: "Quarter", sf: "Playoff", f: "Final" }

export function matchLabel(m: Rec): string {
  const level = String(m.compLevel)
  const name = LEVEL_NAMES[level] ?? level
  if (level === "qm") return `${name} ${String(m.matchNumber)}`
  if (level === "f") return `${name} ${String(m.matchNumber)}`
  return `${name} ${String(m.setNumber)}`
}

export class MatchScheduler {
  constructor(
    private store: Store,
    private users: Users,
    private settings: Settings,
    private push: PushService,
    private clock: Clock,
    /** eventKey → when FRC Nexus last updated its data (ms), from the importer */
    private nexusDataAsOf: (eventKey: string) => number | undefined,
    private liveEvents: () => string[]
  ) {}

  async tick(): Promise<number> {
    if (!this.push.enabled) return 0
    const now = this.clock.now()
    const ourTeam = this.settings.teamNumber()
    const staff = this.users.all().filter((u) => u.active === 1)
    let sent = 0
    for (const eventKey of this.liveEvents()) {
      const event = this.store.live("event", eventKey)
      if (!event || event.isDemo === true) continue
      const asOf = this.nexusDataAsOf(eventKey)
      if (asOf === undefined || now - asOf >= NEXUS_FRESH_MS) continue
      for (const m of this.store.listLive("match", eventKey)) {
        if (m.status === "onField" || m.status === "played") continue
        const predicted = Date.parse(String(m.predictedTime ?? ""))
        if (!Number.isFinite(predicted) || predicted < now - 30 * 60_000) continue
        const red = ((m.alliances as { red?: { teamNumbers?: number[] } })?.red?.teamNumbers ?? []).map(Number)
        const blue = ((m.alliances as { blue?: { teamNumbers?: number[] } })?.blue?.teamNumbers ?? []).map(Number)
        const teams = [...red, ...blue]
        const ours = ourTeam !== null && teams.includes(ourTeam)
        for (const u of staff) {
          const settings = this.store.live("userSettings", u.id)
          const p = prefsOf(settings)
          if (predicted - now > p.matchLeadMinutes * 60_000) continue
          const watched = Array.isArray(settings?.watchedTeams) ? (settings.watchedTeams as unknown[]).map(Number) : []
          const watchedHere = teams.filter((t) => watched.includes(t))
          const wantsOurs = ours && p.ourMatchQueue
          const wantsWatched = watchedHere.length > 0 && p.watchedMatchQueue
          if (!wantsOurs && !wantsWatched) continue
          const minutes = Math.max(0, Math.round((predicted - now) / 60_000))
          const team = wantsOurs ? (ourTeam as number) : (watchedHere[0] as number)
          const color = red.includes(team) ? "red" : "blue"
          sent += await this.push.deliver(
            [u.id],
            {
              kind: "match",
              title: `${matchLabel(m)} is coming up`,
              body: `Team ${team} (${color}) plays ${minutes <= 1 ? "in about a minute" : `in about ${minutes} minutes`}.`,
              url: wantsOurs ? `/scout/strategy/${m.id}` : `/matches/${m.id}`,
              tag: `match:${m.id}`,
              eventKey,
              entity: { type: "match", id: m.id },
            },
            `match:${m.id}`,
            `m${m.id}`
          )
        }
      }
    }
    return sent
  }
}
