// Upstream fixtures in the documented TBA v3, FRC Nexus and Statbotics v3 response shapes.
export const EK = "2026casj"
export const TEAMS = Array.from({ length: 60 }, (_, i) => (i < 3 ? [254, 1678, 2276][i] : 3000 + i) as number)

export const tbaEvent = {
  key: EK,
  name: "Silicon Valley Regional",
  short_name: "Silicon Valley",
  year: 2026,
  event_type: 0,
  event_type_string: "Regional",
  start_date: "2026-03-19",
  end_date: "2026-03-22",
  timezone: "America/Los_Angeles",
  city: "San Jose",
  state_prov: "CA",
  country: "USA",
  week: 3,
}

export const tbaTeams = TEAMS.map((n) => ({
  key: `frc${n}`,
  team_number: n,
  nickname: `Team ${n}`,
  city: "San Jose",
  state_prov: "CA",
  country: "USA",
  rookie_year: 2000,
}))

const t0 = Date.parse("2026-03-20T16:00:00.000Z") / 1000

export function tbaMatches(played = 1) {
  return Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    const red = TEAMS.slice((i * 6) % 54, ((i * 6) % 54) + 3)
    const blue = TEAMS.slice(((i * 6) % 54) + 3, ((i * 6) % 54) + 6)
    const done = n <= played
    return {
      key: `${EK}_qm${n}`,
      comp_level: "qm",
      set_number: 1,
      match_number: n,
      event_key: EK,
      alliances: {
        red: { team_keys: red.map((t) => `frc${t}`), surrogate_team_keys: [], dq_team_keys: [], score: done ? 100 + n : -1 },
        blue: { team_keys: blue.map((t) => `frc${t}`), surrogate_team_keys: [], dq_team_keys: [], score: done ? 90 : -1 },
      },
      winning_alliance: done ? "red" : "",
      time: t0 + i * 480,
      actual_time: done ? t0 + i * 480 + 30 : null,
      predicted_time: t0 + i * 480,
      post_result_time: done ? t0 + i * 480 + 300 : null,
      score_breakdown: done ? { red: { totalAutoPoints: 20, hubScore: { totalCount: 14 } }, blue: { totalAutoPoints: 10 } } : null,
      videos: done ? [{ type: "youtube", key: "abc" }] : [],
    }
  })
}

export const tbaRankings = {
  rankings: TEAMS.slice(0, 20).map((t, i) => ({
    team_key: `frc${t}`,
    rank: i + 1,
    record: { wins: 3, losses: 1, ties: 0 },
    sort_orders: [2.5 - i * 0.1, 40],
    extra_stats: [10],
    matches_played: 4,
    dq: 0,
    qual_average: null,
  })),
  sort_order_info: [
    { name: "Ranking Score", precision: 2 },
    { name: "Avg Match", precision: 2 },
  ],
  extra_stats_info: [{ name: "Total Ranking Points", precision: 0 }],
}

export const statbotics = TEAMS.slice(0, 5).map((t) => ({
  team: t,
  event: EK,
  epa: { total_points: { mean: 42.5, sd: 5 }, breakdown: { auto_fuel: 7, teleop_fuel: 20, total_fuel: 27, endgame_tower: 8 } },
  record: { qual: { wins: 3, losses: 1, ties: 0 } },
}))

export function nexusEvent(asOf: number, nextStart: number, statuses: Record<number, string> = {}) {
  return {
    eventKey: EK,
    dataAsOfTime: asOf,
    nowQueuing: "Qualification 3",
    matches: [
      { label: "Practice 1", status: "On field", redTeams: [], blueTeams: [], times: {} },
      ...Array.from({ length: 12 }, (_, i) => ({
        label: `Qualification ${i + 1}`,
        status: statuses[i + 1] ?? (i < 1 ? "On field" : i < 3 ? "Now queuing" : "Queuing soon"),
        redTeams: ["254", "1678", "2276"],
        blueTeams: ["971", "118", "604"],
        times: {
          scheduledStartTime: nextStart + (i - 1) * 480_000,
          estimatedQueueTime: nextStart + (i - 1) * 480_000 - 1_200_000,
          estimatedStartTime: nextStart + (i - 1) * 480_000,
        },
        breakAfter: null,
      })),
    ],
  }
}

export const nexusPits = Object.fromEntries(TEAMS.slice(0, 6).map((t, i) => [String(t), `A${i + 1}`]))

export const nexusMap = {
  size: { x: 400, y: 200 },
  pits: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`A${i + 1}`, { position: { x: 10 + i * 60, y: 20 }, size: { x: 50, y: 40 } }])),
  areas: { Field: { position: { x: 10, y: 120 }, size: { x: 300, y: 60 }, label: "Field" } },
  labels: [{ text: "Entrance", position: { x: 350, y: 190 } }],
}
