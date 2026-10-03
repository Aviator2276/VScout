import type { ScoringKeys } from "../types"

// TBA per-robot tower strings are unconfirmed until a real fixture is recorded (game-module
// addendum). Unknown strings map to 'unknown' and are logged, never to 'none'.
export const scoringKeys = {
  tba: {
    alliance: {
      autoPoints: "totalAutoPoints",
      teleopPoints: "totalTeleopPoints",
      endgamePoints: "endGameTowerPoints",
      foulPoints: "foulPoints",
      rp: "rp",
      piecesScored: "hubScore.totalCount",
    },
    perRobot: {
      autoClimb: { path: "autoTowerRobot{n}", enumMap: "towerLevel" },
      endgameClimb: { path: "endGameTowerRobot{n}", enumMap: "towerLevel" },
    },
  },
  statbotics: {
    teamEvent: {
      epa: "epa.total_points.mean",
      autoScoring: "epa.breakdown.auto_fuel",
      teleopScoring: "epa.breakdown.teleop_fuel",
      totalScoring: "epa.breakdown.total_fuel",
      climbPoints: "epa.breakdown.endgame_tower",
      rp1: "epa.breakdown.energized_rp",
      rp2: "epa.breakdown.supercharged_rp",
      rp3: "epa.breakdown.traversal_rp",
    },
    match: {
      autoScoring: "result.{alliance}_auto_fuel",
      endgameClimb: "result.{alliance}_endgame_tower",
    },
  },
  enumMaps: {
    towerLevel: {
      None: "none",
      Level1: "level1",
      Level2: "level2",
      Level3: "level3",
    },
  },
  units: {
    autoScoring: "units.pieces",
    teleopScoring: "units.pieces",
    totalScoring: "units.pieces",
  },
} as const satisfies ScoringKeys
