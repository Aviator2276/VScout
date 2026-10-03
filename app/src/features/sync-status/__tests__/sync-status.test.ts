// Sync sheet data (features/sync-status.md S3, criteria 9–10) and the notch's center glyph.
import { describe, expect, it } from "vitest"
import type { OutboxOp } from "@/lib/db/types"
import type { NetworkStatus } from "@/lib/network/network-status"
import type {
  HistorySample,
  TransferRecord,
} from "@/lib/network/network-telemetry"
import { opStatus, titleFor } from "../api/use-waiting-ops"
import { connectionShown } from "../components/sync-notch"
import { chartModel, groupTransfers, sampleAt } from "../utils/connection-chart"

const MIN = 60_000
const sample = (at: number, online: boolean, quality = 4): HistorySample => ({
  at,
  online,
  quality,
  pingMs: online ? 40 : null,
})

describe("connection chart (criterion 10)", () => {
  it("25 min online and 5 offline: one band and the summary", () => {
    const now = 30 * MIN
    const samples: Array<HistorySample> = []
    for (let t = 0; t < 30 * MIN; t += 10_000)
      samples.push(sample(t, !(t >= 10 * MIN && t < 15 * MIN)))
    const m = chartModel(samples, 30 * MIN, 10_000, now)
    expect(m.summary).toBe("Online 25 of 30 min · 1 drop")
    expect(m.bands).toEqual([{ from: 10 * MIN, to: 15 * MIN }])
    expect(m.line.startsWith("M0.0000 0.0000")).toBe(true)
    expect(m.area.endsWith("Z")).toBe(true)
  })

  it("collecting before a minute of history; drops are counted, plural", () => {
    expect(chartModel([], 30 * MIN, 10_000, 0)).toMatchObject({
      summary: "Collecting history…",
      line: "",
      area: "",
    })
    expect(
      chartModel([sample(0, true)], 30 * MIN, 10_000, 10_000).summary
    ).toBe("Collecting history…")
    const flap = [0, 1, 2, 3, 4, 5].map((i) => sample(i * MIN, i % 2 === 0))
    expect(chartModel(flap, 30 * MIN, MIN, 6 * MIN).summary).toBe(
      "Online 3 of 6 min · 3 drops"
    )
  })

  it("samples older than the window are left out", () => {
    const m = chartModel(
      [sample(-40 * MIN, false), sample(0, true)],
      30 * MIN,
      10_000,
      30 * MIN
    )
    expect(m.bands).toEqual([])
  })

  it("the sample under the pointer", () => {
    const s = [sample(0, true), sample(10 * MIN, false), sample(20 * MIN, true)]
    expect(sampleAt(s, 0, 30 * MIN, 0.5)).toBe(s[1])
    expect(sampleAt(s, 0, 30 * MIN, 1)).toBe(s[2])
    expect(sampleAt(s, MIN, 30 * MIN, 0)).toBe(s[0])
    expect(sampleAt([], 0, 30 * MIN, 0.5)).toBeNull()
  })
})

describe("recent transfers", () => {
  const t = (
    id: number,
    at: number,
    o: Partial<TransferRecord> = {}
  ): TransferRecord => ({
    id,
    label: "Changes",
    dir: "down",
    via: "http",
    bytes: 100,
    ms: 10,
    outcome: "ok",
    at,
    ...o,
  })

  it("one sync's pages read as one row", () => {
    const rows = groupTransfers([
      t(5, 5000),
      t(4, 4000),
      t(3, 3500),
      t(2, 3000, { label: "Save comments", dir: "up" }),
      t(1, 100),
    ])
    expect(rows.map((r) => [r.label, r.count ?? 1, r.bytes])).toEqual([
      ["Changes", 3, 300],
      ["Save comments", 1, 100],
      ["Changes", 1, 100],
    ])
  })

  it("in-flight and failed transfers stay apart", () => {
    expect(
      groupTransfers([
        t(2, 10, { outcome: "active", ms: null }),
        t(1, 5, { outcome: "active", ms: null }),
      ])
    ).toHaveLength(2)
    expect(
      groupTransfers([t(2, 10, { outcome: "failed" }), t(1, 5)])
    ).toHaveLength(2)
  })
})

describe("waiting changes (criterion 9)", () => {
  const op = (o: Partial<OutboxOp> = {}): OutboxOp => ({
    seq: 1,
    opId: "op",
    userId: "u",
    entity: "scoutEntry",
    recordId: "r",
    recordKey: "scoutEntry:r",
    eventKey: "2026casj",
    kind: "create",
    state: "queued",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    ...o,
  })

  it("titles say what and where", () => {
    expect(titleFor(op(), { matchKey: "2026casj_qm12", teamNumber: 254 })).toBe(
      "Match scouting · Q12 · 254"
    )
    expect(titleFor(op({ kind: "update", entity: "comment" }), undefined)).toBe(
      "Edit to note"
    )
    expect(titleFor(op({ kind: "delete", entity: "picklist" }), {})).toBe(
      "Delete picklist"
    )
    expect(
      titleFor(op({ kind: "upload", entity: "mediaAsset" }), { teamNumber: 9 })
    ).toBe("Photo upload · 9")
  })

  it("statuses", () => {
    expect(opStatus(op({ state: "inflight" }), 0)).toBe("Uploading…")
    expect(opStatus(op({ state: "blocked", dependsOn: ["x"] }), 0)).toBe(
      "Waiting for photo"
    )
    expect(opStatus(op({ state: "blocked" }), 0)).toBe("Waiting")
    expect(opStatus(op({ state: "failed" }), 0)).toBe("Not saved")
    expect(opStatus(op({ attempts: 2, nextAttemptAt: 12_000 }), 500)).toBe(
      "Retrying in 12 s"
    )
    expect(opStatus(op({ attempts: 2, nextAttemptAt: 100 }), 500)).toBe(
      "Waiting"
    )
  })
})

describe("the notch's center glyph", () => {
  const status = (o: Partial<NetworkStatus>): NetworkStatus => ({
    connection: "online",
    quality: 3,
    attention: false,
    down: { mode: "idle", bps: null, waiting: false },
    up: { mode: "idle", bps: null, waiting: false },
    summary: "",
    ...o,
  })
  it("offline beats attention beats bars; connecting sweeps", () => {
    expect(
      connectionShown(status({ connection: "offline", attention: true }))
    ).toEqual({
      kind: "offline",
    })
    expect(connectionShown(status({ attention: true }))).toEqual({
      kind: "attention",
    })
    expect(connectionShown(status({}))).toEqual({
      kind: "bars",
      quality: 3,
      sweeping: false,
    })
    expect(connectionShown(status({ connection: "connecting" }))).toMatchObject(
      { sweeping: true }
    )
  })
})
