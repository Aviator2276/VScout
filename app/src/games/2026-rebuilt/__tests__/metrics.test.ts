import { describe, expect, it } from "vitest"
import type { IncidentValue, MetricInput, ScoutEntryView } from "../../types"
import { metrics } from "../metrics"

const metric = (id: string) => {
  const m = metrics.find((x) => x.id === id)
  if (!m) throw new Error(id)
  return m.compute
}

const entry = (
  data: Record<string, unknown>,
  disagreements: Array<string> = []
): ScoutEntryView => ({
  matchKey: `m${Math.random()}`,
  data,
  scouterCount: 1,
  disagreements,
})

const incident = (o: Partial<IncidentValue>): IncidentValue => ({
  id: "i",
  phase: "teleop",
  type: "noMovement",
  category: "electrical",
  length: "long",
  resolution: null,
  resolutionNote: null,
  note: null,
  ...o,
})

const input = (
  entries: Array<ScoutEntryView>,
  window: MetricInput["window"] = "all"
): MetricInput => ({
  teamNumber: 254,
  window,
  matches: [],
  entries,
  allianceRanks: [],
  pit: null,
  post: [],
  external: null,
  weights: {},
})

describe("2026 metrics", () => {
  it("reliability ignores brief stops and field faults, counts no-shows", () => {
    const r = metric("reliability")(
      input([
        entry({ incidents: [incident({ length: "brief" })] }),
        entry({ incidents: [incident({ type: "fieldFault" })] }),
        entry({ incidents: [incident({})] }),
        entry({ "pre.noShow": true }),
      ])
    )
    expect(r.value).toBe(0.5)
    expect(r.breakdown).toContainEqual({
      label: "metric.reliability.electrical",
      value: 1,
    })
  })

  it("consistency is 1 for identical ratings and lower when they vary", () => {
    const same = metric("consistency")(
      input(
        [1, 2, 3].map(() =>
          entry({ "teleop.scoringRating": 4, "auto.effectiveness": 4 })
        )
      )
    )
    expect(same.value).toBe(1)
    const varied = metric("consistency")(
      input([
        entry({ "teleop.scoringRating": 1 }),
        entry({ "teleop.scoringRating": 5 }),
      ])
    )
    expect(varied.value).toBe(0)
  })

  it("defense averages only matches played on defense", () => {
    const r = metric("defense")(
      input([
        entry({ "teleop.role": "defense", "teleop.defenseRating": 5 }),
        entry({ "teleop.role": "mixed", "teleop.defenseRating": 3 }),
        entry({ "teleop.role": "offense" }),
      ])
    )
    expect(r.value).toBe(4)
    expect(r.breakdown).toContainEqual({
      label: "metric.defense.rate",
      value: 0.667,
    })
  })

  it("auto effectiveness is lowered by auto breakdowns", () => {
    const r = metric("autoEffectiveness")(
      input([
        entry({ "auto.effectiveness": 4, "auto.climb": "level1" }),
        entry({
          "auto.effectiveness": 4,
          incidents: [incident({ phase: "auto" })],
        }),
      ])
    )
    expect(r.value).toBe(2)
  })

  it("needs at least two samples and honors the last-4 window", () => {
    expect(
      metric("defense")(
        input([entry({ "teleop.role": "defense", "teleop.defenseRating": 5 })])
      ).value
    ).toBeNull()
    const entries = [1, 1, 1, 1, 5, 5, 5, 5].map((v) =>
      entry({ "auto.effectiveness": v })
    )
    expect(metric("autoEffectiveness")(input(entries, "last4")).value).toBe(5)
    expect(metric("autoEffectiveness")(input(entries, "all")).value).toBe(3)
  })
})
