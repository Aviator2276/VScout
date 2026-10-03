// A mid-qualification demo event for `pnpm mock:api` (a first step toward AD7a, FX-60): 40 teams
// and 80 quals around "now", with the first 32 played, Q33 on the field and rankings so far. Times
// are relative to when the mock starts, so "up next" and "coming up" always have something.
import {
  wireEnvelope,
  wireEventTeam,
  wireMatch,
  wireTeam,
} from "../factories/wire"
import { mockBackend } from "./mock-backend"

const NAMES: Record<number, string> = {
  254: "The Cheesy Poofs",
  1678: "Citrus Circuits",
  971: "Spartan Robotics",
  604: "Quixilver",
  846: "The Funky Monkeys",
  1323: "MadTown Robotics",
  2276: "Demo Robotics",
  4414: "HighTide",
  5940: "B.R.E.A.D.",
  6328: "Mechanical Advantage",
}

const TEAMS = [
  ...Object.keys(NAMES).map(Number),
  ...Array.from({ length: 30 }, (_, i) => 3000 + i * 37),
]
const MATCHES = 80
const PLAYED = 32
const CYCLE_MS = 7 * 60_000

export function seedDemoEvent(eventKey: string, now = Date.now()): void {
  for (const teamNumber of TEAMS)
    mockBackend.append(
      "global",
      "team",
      wireEnvelope(
        "team",
        wireTeam({
          teamNumber,
          nickname: NAMES[teamNumber] ?? `Team ${teamNumber}`,
        })
      )
    )

  const start = now - (PLAYED + 1) * CYCLE_MS
  const wins = new Map<number, number>()
  for (let i = 0; i < MATCHES; i++) {
    const matchNumber = i + 1
    const pick = (k: number) => TEAMS[(i * 6 + k * 7) % TEAMS.length] ?? 254
    const red = [pick(0), pick(1), pick(2)]
    const blue = [pick(3), pick(4), pick(5)]
    const played = matchNumber <= PLAYED
    const redScore = 60 + ((matchNumber * 13) % 45)
    const blueScore = 55 + ((matchNumber * 29) % 45)
    if (played)
      for (const t of redScore >= blueScore ? red : blue)
        wins.set(t, (wins.get(t) ?? 0) + 1)
    mockBackend.append(
      `event:${eventKey}`,
      "match",
      wireEnvelope(
        "match",
        wireMatch({
          id: `${eventKey}_qm${matchNumber}`,
          eventKey,
          matchNumber,
          scheduledTime: new Date(start + matchNumber * CYCLE_MS).toISOString(),
          alliances: {
            red: {
              teamNumbers: red,
              surrogates: [],
              dqs: [],
              score: played ? redScore : null,
            },
            blue: {
              teamNumbers: blue,
              surrogates: [],
              dqs: [],
              score: played ? blueScore : null,
            },
          },
          status: played
            ? "played"
            : matchNumber === PLAYED + 1
              ? "onField"
              : "scheduled",
          winningAlliance: played
            ? redScore >= blueScore
              ? "red"
              : "blue"
            : null,
        })
      )
    )
  }

  const ranked = [...TEAMS].sort(
    (a, b) => (wins.get(b) ?? 0) - (wins.get(a) ?? 0) || a - b
  )
  ranked.forEach((teamNumber, i) =>
    mockBackend.append(
      `event:${eventKey}`,
      "eventTeam",
      wireEnvelope(
        "eventTeam",
        wireEventTeam({
          id: `${eventKey}_${teamNumber}`,
          eventKey,
          teamNumber,
          rank: i + 1,
        })
      )
    )
  )
}
