// MQTT fan-out (REQUIREMENTS §9.4–9.6): commit → change log → publish. One envelope per message,
// priority lanes, bulk imports collapse into a `control resync`, oversized envelopes too.
import type { Bus } from "../domain/bus.js"
import { QOS, laneFor } from "../domain/entities.js"
import type { EntityName } from "../domain/entities.js"
import { topicFor } from "../domain/routing.js"
import type { CommittedBatch, Store } from "../domain/store.js"
import { iso } from "../lib/clock.js"
import type { Clock } from "../lib/clock.js"

export interface PublishOptions {
  qos: 0 | 1
  retain?: boolean
  properties?: Record<string, unknown>
}

/** The broker connection, as the publisher needs it (mqtt.js in production, a fake in tests). */
export interface MqttLink {
  readonly connected: boolean
  publish(topic: string, payload: string | Buffer, opts: PublishOptions): Promise<void>
}

export const MAX_DATA_ENVELOPE = 8 * 1024
export const MAX_USER_ENVELOPE = 64 * 1024
export const BULK_THRESHOLD = 50
export const BULK_RATE_PER_SEC = 20

interface Msg {
  topic: string
  payload: string
  opts: PublishOptions
}

export class Publisher {
  private link: MqttLink | null = null
  private bulk = new Map<string, Msg[]>()
  private timer: NodeJS.Timeout | null = null
  failures = 0
  published = 0

  constructor(
    store: Store,
    bus: Bus,
    private clock: Clock,
    private sysStatus: () => Record<string, unknown>,
    private log: (msg: string, err?: unknown) => void = () => {}
  ) {
    store.onCommit((b) => this.onBatch(b))
    bus.on("inbox", (e) => this.send({ topic: `vscout/user/${e.userId}/inbox`, payload: JSON.stringify(e.payload), opts: { qos: 1 } }))
    bus.on("control", (e) =>
      this.send({ topic: `vscout/event/${e.eventKey}/control`, payload: JSON.stringify(e.payload), opts: { qos: 1 } })
    )
    bus.on("alert", (e) => {
      if (!e.eventKey) return
      this.send({
        topic: `vscout/event/${e.eventKey}/admin/alerts`,
        payload: JSON.stringify({ v: 1, kind: e.kind, message: e.message, ts: iso(this.clock.now()), ...(e.detail ? { detail: e.detail } : {}) }),
        opts: { qos: 1 },
      })
    })
  }

  attach(link: MqttLink) {
    this.link = link
  }

  /** Called on every (re)connect: the retained status every client reads first. */
  publishStatus() {
    this.send({ topic: "vscout/sys/status", payload: JSON.stringify(this.sysStatus()), opts: { qos: 1, retain: true } })
  }

  private resync(eventKey: string, entities: Iterable<string>, reason: string) {
    this.send({
      topic: `vscout/event/${eventKey}/control`,
      payload: JSON.stringify({ v: 1, cmd: "resync", entities: [...new Set(entities)].sort(), reason, ts: iso(this.clock.now()) }),
      opts: { qos: 1 },
    })
  }

  private onBatch(batch: CommittedBatch) {
    // event key → entities that changed in this batch (for bulk detection)
    const perEvent = new Map<string, { count: number; entities: Set<string> }>()
    const resyncs = new Map<string, Set<string>>()
    const out: Array<Msg & { lane: string; eventKey: string | null }> = []

    for (const { envelope, targets } of batch.changes) {
      const payload = JSON.stringify(envelope)
      const size = Buffer.byteLength(payload)
      const entity = envelope.entity as EntityName
      for (const t of targets) {
        const ek = t.scope.startsWith("event:") ? t.scope.slice(6) : null
        if (ek) {
          const s = perEvent.get(ek) ?? { count: 0, entities: new Set<string>() }
          s.count++
          s.entities.add(entity)
          perEvent.set(ek, s)
        }
        if (t.excludeUser) {
          // can't exclude one subscriber from a shared topic: let clients re-pull (filtered) instead
          if (ek) (resyncs.get(ek) ?? resyncs.set(ek, new Set()).get(ek))?.add(entity)
          continue
        }
        const limit = t.scope.startsWith("user:") ? MAX_USER_ENVELOPE : MAX_DATA_ENVELOPE
        if (size > limit) {
          if (ek) (resyncs.get(ek) ?? resyncs.set(ek, new Set()).get(ek))?.add(entity)
          else this.log(`envelope too large for MQTT (${entity} ${envelope.id}, ${size} B); clients catch up on next sync`)
          continue
        }
        out.push({
          topic: topicFor(t, entity),
          payload,
          opts: { qos: QOS[entity] },
          lane: laneFor(entity, envelope.data),
          eventKey: ek,
        })
      }
    }

    // an import touching more than 50 records becomes one resync per event it touched, global
    // records included (an event import also brings its teams)
    const collapsed = new Set<string>()
    let collapseGlobal = false
    if (batch.source === "import" && perEvent.size > 0 && out.length + resyncs.size > BULK_THRESHOLD) {
      const total = batch.changes.reduce((n, c) => n + c.targets.length, 0)
      if (total > BULK_THRESHOLD) {
        collapseGlobal = true
        const globalEntities = out.filter((m) => !m.eventKey).map((m) => JSON.parse(m.payload).entity as string)
        for (const [ek, s] of perEvent) {
          collapsed.add(ek)
          const set = resyncs.get(ek) ?? new Set<string>()
          for (const e of [...s.entities, ...globalEntities]) set.add(e)
          resyncs.set(ek, set)
        }
      }
    }
    for (const m of out) {
      if (m.eventKey ? collapsed.has(m.eventKey) : collapseGlobal) continue
      if (m.lane === "bulk") this.enqueueBulk(m.eventKey ?? "global", m)
      else this.send(m)
    }
    for (const [ek, entities] of resyncs) this.resync(ek, entities, collapsed.has(ek) ? "bulk" : "audience")
  }

  private enqueueBulk(key: string, m: Msg) {
    const q = this.bulk.get(key) ?? []
    q.push(m)
    this.bulk.set(key, q)
    this.timer ??= setInterval(() => this.drainBulk(), 1000 / BULK_RATE_PER_SEC)
  }

  /** One message per event per tick: ~20 messages/s per event. */
  drainBulk() {
    for (const [key, q] of this.bulk) {
      const m = q.shift()
      if (m) this.send(m)
      if (!q.length) this.bulk.delete(key)
    }
    if (!this.bulk.size && this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Flushes every queued bulk message now (tests, shutdown). */
  flush() {
    while (this.bulk.size) this.drainBulk()
  }

  private send(m: Msg) {
    const link = this.link
    if (!link?.connected) {
      // the change log is the source of truth: clients catch up after reconnecting
      this.failures++
      return
    }
    link.publish(m.topic, m.payload, m.opts).then(
      () => {
        this.published++
      },
      (err: unknown) => {
        this.failures++
        this.log(`publish to ${m.topic} failed`, err)
      }
    )
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
