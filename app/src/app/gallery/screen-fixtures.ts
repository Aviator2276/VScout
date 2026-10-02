// Small, fixed data for the gallery's Screens page: enough rows to show every row variant (played,
// on field, up next, playoffs, unranked) without a database.
import type { MatchRecord } from "@/lib/db/types"

const BASE = Date.UTC(2026, 2, 20, 16, 0)

function match(
  n: number,
  o: Partial<MatchRecord> & {
    red?: Array<number>
    blue?: Array<number>
    scores?: [number, number]
  } = {}
): MatchRecord {
  const compLevel = o.compLevel ?? "qm"
  const key =
    compLevel === "qm"
      ? `2026demo_qm${n}`
      : `2026demo_${compLevel}${o.setNumber ?? n}m1`
  const red = o.red ?? [254, 1678, 971]
  const blue = o.blue ?? [2276, 604, 846]
  return {
    id: key,
    key,
    rev: 1,
    updatedAt: BASE,
    eventKey: "2026demo",
    compLevel,
    setNumber: o.setNumber ?? 1,
    matchNumber: compLevel === "qm" ? n : 1,
    scheduledTime: BASE + n * 7 * 60_000,
    predictedTime: null,
    predictedAt: null,
    actualTime: null,
    alliances: {
      red: {
        teamNumbers: red,
        score: o.scores?.[0] ?? null,
        surrogates: [],
        dqs: [],
      },
      blue: {
        teamNumbers: blue,
        score: o.scores?.[1] ?? null,
        surrogates: [],
        dqs: [],
      },
    },
    status: o.status ?? (o.scores ? "played" : "scheduled"),
    winningAlliance: o.scores
      ? o.scores[0] > o.scores[1]
        ? "red"
        : "blue"
      : null,
    scoreBreakdown: null,
    videoKeys: [],
    teamNumbers: [...red, ...blue],
  }
}

export const GALLERY_NOW = BASE + 20 * 60_000

export const galleryMatches: Array<MatchRecord> = [
  match(1, { scores: [112, 98] }),
  match(2, { scores: [87, 101], red: [4414, 118, 2910] }),
  match(3, { status: "onField", red: [5940, 1323, 6328] }),
  match(4, { red: [3310, 2056, 1114] }),
  match(5),
  match(1, { compLevel: "sf", setNumber: 1 }),
]

export const galleryTeams = [
  { teamNumber: 254, nickname: "The Cheesy Poofs", city: "San Jose", rank: 1 },
  { teamNumber: 1678, nickname: "Citrus Circuits", city: "Davis", rank: 2 },
  { teamNumber: 2276, nickname: "Demo Robotics", city: null, rank: 3 },
  { teamNumber: 9999, nickname: "Newcomers", city: null, rank: null },
]
