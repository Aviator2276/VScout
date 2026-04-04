import { db } from '@/utils/db';
import { Match } from '@/types/match';
import { TeamInfo } from '@/types/team';
import { ActionSegment, RobotActionRecord } from '@/types/scouting';

/**
 * Map climb level string to a numeric value.
 */
function climbToNumber(climb: string): number {
  switch (climb) {
    case 'L1':
      return 1;
    case 'L2':
      return 2;
    case 'L3':
      return 3;
    default:
      return 0;
  }
}

/**
 * Climb level points for estimating points contributed.
 */
function climbToPoints(climb: string): number {
  switch (climb) {
    case 'L1':
      return 2;
    case 'L2':
      return 6;
    case 'L3':
      return 12;
    default:
      return 0;
  }
}

/**
 * Calculate the median of a sorted numeric array.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate the population standard deviation of a numeric array.
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate consistency score using coefficient of variation (CV) approach.
 * Returns a value between 0 and 1, where 1 is perfectly consistent.
 * Uses weighted average of individual metric consistencies.
 */
function calculateConsistency(
  medianAutoFuel: number,
  sdAutoFuel: number,
  medianTeleFuel: number,
  sdTeleFuel: number,
  medianClimb: number,
  sdClimb: number,
  medianPoints: number,
  sdPoints: number,
): number {
  // Calculate individual consistencies using 1 - CV (coefficient of variation)
  // Clamp to 0-1 range to handle edge cases
  const calcCV = (median: number, sd: number): number => {
    if (median === 0) return sd === 0 ? 1 : 0; // If no performance, only consistent if no variance
    const cv = sd / median;
    return Math.max(0, Math.min(1, 1 - cv));
  };

  const autoConsistency = calcCV(medianAutoFuel, sdAutoFuel);
  const teleConsistency = calcCV(medianTeleFuel, sdTeleFuel);
  const climbConsistency = calcCV(medianClimb, sdClimb);
  const pointsConsistency = calcCV(medianPoints, sdPoints);

  // Weighted average - teleop fuel and points are weighted higher
  const weights = {
    auto: 0.15,
    tele: 0.35,
    climb: 0.15,
    points: 0.35,
  };

  const weightedConsistency =
    autoConsistency * weights.auto +
    teleConsistency * weights.tele +
    climbConsistency * weights.climb +
    pointsConsistency * weights.points;

  return Math.round(weightedConsistency * 100) / 100;
}

/**
 * Team position keys used to look up per-team fields on a Match.
 */
const TEAM_POSITIONS = [
  { teamKey: 'blue_team_1', prefix: 'blue_1' },
  { teamKey: 'blue_team_2', prefix: 'blue_2' },
  { teamKey: 'blue_team_3', prefix: 'blue_3' },
  { teamKey: 'red_team_1', prefix: 'red_1' },
  { teamKey: 'red_team_2', prefix: 'red_2' },
  { teamKey: 'red_team_3', prefix: 'red_3' },
] as const;

interface TeamMatchData {
  autoFuel: number;
  teleFuel: number;
  climbLevel: number;
  pointsContributed: number;
}

interface TeamTimeStats {
  avg_shooting_time: number;
  avg_shooting_interval: number;
  avg_intake_herding_interval: number;
  avg_disabled_time: number;
  avg_defense_time: number;
}

/**
 * Calculate the percentile of a value within a sorted array.
 * Returns 0-100. Uses "percentage of values below" method.
 */
function percentile(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const below = sortedValues.filter((v) => v < value).length;
  const equal = sortedValues.filter((v) => v === value).length;
  const p = ((below + equal * 0.5) / sortedValues.length) * 100;
  return Math.round(p * 10) / 10;
}

/**
 * Get the average duration of continuous intervals of given actions
 * that are longer than a minimum threshold (in seconds).
 */
function avgIntervalDuration(
  segments: ActionSegment[],
  actions: string[],
  minDuration: number,
): number {
  const intervals: number[] = [];
  let currentDuration = 0;

  for (const seg of segments) {
    if (actions.includes(seg.action)) {
      currentDuration += seg.duration;
    } else {
      if (currentDuration > minDuration) {
        intervals.push(currentDuration);
      }
      currentDuration = 0;
    }
  }
  // Flush trailing interval
  if (currentDuration > minDuration) {
    intervals.push(currentDuration);
  }

  if (intervals.length === 0) return 0;
  return intervals.reduce((s, v) => s + v, 0) / intervals.length;
}

/**
 * Get total time spent on given actions across all segments.
 */
function totalActionTime(segments: ActionSegment[], actions: string[]): number {
  return segments
    .filter((seg) => actions.includes(seg.action))
    .reduce((sum, seg) => sum + seg.duration, 0);
}

/**
 * Calculate time-based stats for a team from their robot action records.
 */
function calculateTimeStats(
  actionRecords: RobotActionRecord[],
): TeamTimeStats | null {
  if (actionRecords.length === 0) return null;

  const perMatch = actionRecords.map((record) => {
    const allSegments = [...record.auto, ...record.tele];

    const shootingTime = totalActionTime(allSegments, ['shooting']);
    const shootingInterval = avgIntervalDuration(allSegments, ['shooting'], 2);
    const intakeHerdingInterval = avgIntervalDuration(
      allSegments,
      ['intake', 'herding'],
      2,
    );
    const disabledTime = totalActionTime(allSegments, ['disabled']);
    const defenseTime = totalActionTime(allSegments, ['defending']);

    return {
      shootingTime,
      shootingInterval,
      intakeHerdingInterval,
      disabledTime,
      defenseTime,
    };
  });

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

  return {
    avg_shooting_time: Math.round(avg(perMatch.map((m) => m.shootingTime)) * 100) / 100,
    avg_shooting_interval: Math.round(avg(perMatch.map((m) => m.shootingInterval)) * 100) / 100,
    avg_intake_herding_interval:
      Math.round(avg(perMatch.map((m) => m.intakeHerdingInterval)) * 100) / 100,
    avg_disabled_time: Math.round(avg(perMatch.map((m) => m.disabledTime)) * 100) / 100,
    avg_defense_time: Math.round(avg(perMatch.map((m) => m.defenseTime)) * 100) / 100,
  };
}

/**
 * Check if all 6 robots in a match have been scouted.
 */
function isFullyScouted(match: Match): boolean {
  return TEAM_POSITIONS.every((pos) => {
    const scouted = (match as any)[`${pos.prefix}_scouted`] as boolean | undefined;
    return scouted === true;
  });
}

/**
 * Check if a specific team was scouted in a match.
 */
function isTeamScouted(match: Match, teamNumber: number): boolean {
  for (const { teamKey, prefix } of TEAM_POSITIONS) {
    if (match[teamKey].number !== teamNumber) continue;
    const scouted = (match as any)[`${prefix}_scouted`] as boolean | undefined;
    return scouted === true;
  }
  return false;
}

/**
 * Extract a team's per-match stats from a Match object given the team number.
 * Returns null if the team is not in the match.
 * Assumes the match has already been verified as fully scouted.
 */
function extractTeamData(match: Match, teamNumber: number): TeamMatchData | null {
  for (const { teamKey, prefix } of TEAM_POSITIONS) {
    const team = match[teamKey];
    if (team.number !== teamNumber) continue;

    const autoFuel = (match as any)[`${prefix}_auto_fuel`] as number ?? 0;
    const teleFuel = (match as any)[`${prefix}_teleop_fuel`] as number ?? 0;
    const climbStr = (match as any)[`${prefix}_climb`] as string ?? 'None';
    const fuelScored = (match as any)[`${prefix}_fuel_scored`] as number ?? 0;

    return {
      autoFuel,
      teleFuel,
      climbLevel: climbToNumber(climbStr),
      pointsContributed: fuelScored + climbToPoints(climbStr),
    };
  }
  return null;
}

/**
 * Collect per-team fuel stats (no DB write — deferred for percentile pass).
 */
function collectTeamFuelStats(
  teamNumber: number,
  playedMatches: Match[],
): {
  medianAutoFuel: number;
  sdAutoFuel: number;
  medianTeleFuel: number;
  sdTeleFuel: number;
  medianClimbLevel: number;
  sdClimbLevel: number;
  medianPointsContributed: number;
  sdPointsContributed: number;
  localConsistency: number;
  medianFuel: number;
} | null {
  const dataPoints: TeamMatchData[] = [];

  for (const match of playedMatches) {
    if (!isFullyScouted(match)) continue;
    const data = extractTeamData(match, teamNumber);
    if (data) {
      dataPoints.push(data);
    }
  }

  if (dataPoints.length === 0) return null;

  const autoFuels = dataPoints.map((d) => d.autoFuel);
  const teleFuels = dataPoints.map((d) => d.teleFuel);
  const climbLevels = dataPoints.map((d) => d.climbLevel);
  const pointsContributed = dataPoints.map((d) => d.pointsContributed);
  const totalFuels = dataPoints.map((d) => d.autoFuel + d.teleFuel);

  const medianAutoFuel = Math.round(median(autoFuels) * 100) / 100;
  const sdAutoFuel = Math.round(standardDeviation(autoFuels) * 100) / 100;
  const medianTeleFuel = Math.round(median(teleFuels) * 100) / 100;
  const sdTeleFuel = Math.round(standardDeviation(teleFuels) * 100) / 100;
  const medianClimbLevel = Math.round(median(climbLevels) * 100) / 100;
  const sdClimbLevel = Math.round(standardDeviation(climbLevels) * 100) / 100;
  const medianPointsContributed = Math.round(median(pointsContributed) * 100) / 100;
  const sdPointsContributed = Math.round(standardDeviation(pointsContributed) * 100) / 100;
  const medianFuel = Math.round(median(totalFuels) * 100) / 100;

  const localConsistency = calculateConsistency(
    medianAutoFuel,
    sdAutoFuel,
    medianTeleFuel,
    sdTeleFuel,
    medianClimbLevel,
    sdClimbLevel,
    medianPointsContributed,
    sdPointsContributed,
  );

  return {
    medianAutoFuel,
    sdAutoFuel,
    medianTeleFuel,
    sdTeleFuel,
    medianClimbLevel,
    sdClimbLevel,
    medianPointsContributed,
    sdPointsContributed,
    localConsistency,
    medianFuel,
  };
}

/**
 * Calculate and store stats for all teams in the current competition.
 * Should be called after sync refresh or when a scouting record is saved.
 */
export async function calculateAllTeamStats(): Promise<void> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return;

  const allMatches = await db.matches
    .where('competitionCode')
    .equals(compCode)
    .toArray();

  const playedMatches = allMatches.filter((m) => m.has_played);
  if (playedMatches.length === 0) return;

  // Load all robot action records for this competition
  const allActionRecords = await db.robotActions
    .where('competitionCode')
    .equals(compCode)
    .toArray();

  // Build a set of scouted (team, match) pairs for quick lookup
  const scoutedMatchKeys = new Set<string>();
  for (const match of playedMatches) {
    for (const { teamKey, prefix } of TEAM_POSITIONS) {
      const team = match[teamKey];
      const scouted = (match as any)[`${prefix}_scouted`] as boolean | undefined;
      if (scouted && team?.number) {
        scoutedMatchKeys.add(
          `${team.number}_${match.match_type}_${match.set_number}_${match.match_number}`,
        );
      }
    }
  }

  // Group action records by team number, only including scouted matches
  const actionsByTeam = new Map<number, RobotActionRecord[]>();
  for (const record of allActionRecords) {
    const key = `${record.team_number}_${record.match_type}_${record.set_number}_${record.match_number}`;
    if (!scoutedMatchKeys.has(key)) continue;
    const existing = actionsByTeam.get(record.team_number) || [];
    existing.push(record);
    actionsByTeam.set(record.team_number, existing);
  }

  // Collect all unique team numbers from played matches
  const teamNumbers = new Set<number>();
  for (const match of playedMatches) {
    for (const { teamKey } of TEAM_POSITIONS) {
      const team = match[teamKey];
      if (team?.number) {
        teamNumbers.add(team.number);
      }
    }
  }

  console.log(
    `Calculating stats for ${teamNumbers.size} teams across ${playedMatches.length} played matches...`,
  );

  // Phase 1: Collect per-team fuel stats and time stats
  const teamFuelStats = new Map<number, NonNullable<ReturnType<typeof collectTeamFuelStats>>>();
  const teamTimeStats = new Map<number, TeamTimeStats>();

  for (const teamNumber of teamNumbers) {
    const fuelStats = collectTeamFuelStats(teamNumber, playedMatches);
    if (fuelStats) {
      teamFuelStats.set(teamNumber, fuelStats);
    }

    const records = actionsByTeam.get(teamNumber);
    if (records) {
      const timeStats = calculateTimeStats(records);
      if (timeStats) {
        teamTimeStats.set(teamNumber, timeStats);
      }
    }
  }

  // Phase 2: Build sorted arrays for percentile calculation
  const allMedianFuels = [...teamFuelStats.values()].map((s) => s.medianFuel).sort((a, b) => a - b);
  const allMedianAutoFuels = [...teamFuelStats.values()].map((s) => s.medianAutoFuel).sort((a, b) => a - b);
  const allShootingTimes = [...teamTimeStats.values()].map((s) => s.avg_shooting_time).sort((a, b) => a - b);
  const allShootingIntervals = [...teamTimeStats.values()].map((s) => s.avg_shooting_interval).sort((a, b) => a - b);
  const allIntakeHerdingIntervals = [...teamTimeStats.values()].map((s) => s.avg_intake_herding_interval).sort((a, b) => a - b);
  const allDisabledTimes = [...teamTimeStats.values()].map((s) => s.avg_disabled_time).sort((a, b) => a - b);
  const allDefenseTimes = [...teamTimeStats.values()].map((s) => s.avg_defense_time).sort((a, b) => a - b);

  // Phase 3: Write stats + percentiles to DB
  for (const teamNumber of teamNumbers) {
    const existing = await db.teamInfo.get([compCode, teamNumber]);
    if (!existing) continue;

    const fuel = teamFuelStats.get(teamNumber);
    const time = teamTimeStats.get(teamNumber);

    const stats: Partial<TeamInfo> = {};

    if (fuel) {
      stats.median_auto_fuel = fuel.medianAutoFuel;
      stats.sd_auto_fuel = fuel.sdAutoFuel;
      stats.median_tele_fuel = fuel.medianTeleFuel;
      stats.sd_tele_fuel = fuel.sdTeleFuel;
      stats.median_climb_level = fuel.medianClimbLevel;
      stats.sd_climb_level = fuel.sdClimbLevel;
      stats.median_points_contributed = fuel.medianPointsContributed;
      stats.sd_points_contributed = fuel.sdPointsContributed;
      stats.local_consistency = fuel.localConsistency;
      stats.percentile_median_fuel = percentile(fuel.medianFuel, allMedianFuels);
      stats.percentile_median_auto_fuel = percentile(fuel.medianAutoFuel, allMedianAutoFuels);
    }

    if (time) {
      stats.avg_shooting_time = time.avg_shooting_time;
      stats.avg_shooting_interval = time.avg_shooting_interval;
      stats.avg_intake_herding_interval = time.avg_intake_herding_interval;
      stats.avg_disabled_time = time.avg_disabled_time;
      stats.avg_defense_time = time.avg_defense_time;
      stats.percentile_avg_shooting_time = percentile(time.avg_shooting_time, allShootingTimes);
      stats.percentile_avg_shooting_interval = percentile(time.avg_shooting_interval, allShootingIntervals);
      stats.percentile_avg_intake_herding_interval = percentile(time.avg_intake_herding_interval, allIntakeHerdingIntervals);
      stats.percentile_avg_disabled_time = percentile(time.avg_disabled_time, allDisabledTimes);
      stats.percentile_avg_defense_time = percentile(time.avg_defense_time, allDefenseTimes);
    }

    await db.teamInfo.put({ ...existing, ...stats });
  }

  console.log('Team stats calculation completed');
}

/**
 * Calculate and store stats for a single team in the current competition.
 * Useful after saving a scouting record for a specific team.
 * Note: percentiles require all-team data so this calls calculateAllTeamStats.
 */
export async function calculateSingleTeamStats(teamNumber: number): Promise<void> {
  // Percentiles depend on all teams, so recalculate everything
  await calculateAllTeamStats();
}
