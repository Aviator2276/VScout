import { describe, expect, it } from "vitest"
import type { ScoringKeys } from "@/games/types"
import { validationFlags } from "../utils/validation-flags"

const keys: ScoringKeys = {
  tba: {
    alliance: {},
    perRobot: { endClimb: { path: "endRobot{n}", enumMap: "level" } },
  },
  statbotics: { teamEvent: {}, match: {} },
  enumMaps: { level: { Level1: "level1", Level2: "level2", None: "none" } },
  units: {},
}
const validations = [
  {
    id: "climb",
    matchField: "end.climb",
    tbaPerRobot: "endClimb",
    compare: "equal" as const,
  },
]
const entry = (
  id: string,
  station: string,
  climb: string,
  matchKey = "e_qm12"
) => ({
  id,
  matchKey,
  teamNumber: 254,
  station,
  authorId: "u1",
  data: { "end.climb": climb },
})

describe("validation flags (features/admin.md AD4, criterion 12)", () => {
  it("flags a scouted level that TBA recorded differently, with both values", () => {
    const { flags } = validationFlags(
      validations,
      keys,
      [
        {
          key: "e_qm12",
          scoreBreakdown: { red: { endRobot2: "Level2" }, blue: {} },
        },
      ],
      [entry("a", "red2", "level1"), entry("b", "red2", "level2")]
    )
    expect(flags).toEqual([
      expect.objectContaining({
        entryId: "a",
        scouted: "level1",
        tba: "level2",
      }),
    ])
  })

  it("unknown TBA values never flag; missing breakdowns are counted", () => {
    const r = validationFlags(
      validations,
      keys,
      [
        { key: "e_qm12", scoreBreakdown: { red: { endRobot1: "Weird" } } },
        { key: "e_qm13", scoreBreakdown: null },
      ],
      [entry("a", "red1", "level1"), entry("b", "blue1", "none", "e_qm13")]
    )
    expect(r.flags).toEqual([])
    expect(r.missingBreakdowns).toBe(1)
  })
})
