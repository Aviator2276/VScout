import { db } from '@/utils/db';
import { Match } from '@/types/match';
import { TeamInfo } from '@/types/team';

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

/**
 * Extract a team's per-match stats from a Match object given the team number.
 * Returns null if the team is not in the match.
 */
function extractTeamData(match: Match, teamNumber: number): TeamMatchData | null {
  for (const { teamKey, prefix } of TEAM_POSITIONS) {
    const team = match[teamKey];
    if (team.number !== teamNumber) continue;

    // Skip unscouted positions — their fields default to 0 and would skew stats
    const scouted = (match as any)[`${prefix}_scouted`] as boolean | undefined;
    if (!scouted) return null;

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
 * Calculate and store stats for a single team in a competition.
 */
async function calculateTeamStats(
  competitionCode: string,
  teamNumber: number,
  playedMatches: Match[],
): Promise<void> {
  const dataPoints: TeamMatchData[] = [];

  for (const match of playedMatches) {
    const data = extractTeamData(match, teamNumber);
    if (data) {
      dataPoints.push(data);
    }
  }

  if (dataPoints.length === 0) return;

  const autoFuels = dataPoints.map((d) => d.autoFuel);
  const teleFuels = dataPoints.map((d) => d.teleFuel);
  const climbLevels = dataPoints.map((d) => d.climbLevel);
  const pointsContributed = dataPoints.map((d) => d.pointsContributed);

  const medianAutoFuel = Math.round(median(autoFuels) * 100) / 100;
  const sdAutoFuel = Math.round(standardDeviation(autoFuels) * 100) / 100;
  const medianTeleFuel = Math.round(median(teleFuels) * 100) / 100;
  const sdTeleFuel = Math.round(standardDeviation(teleFuels) * 100) / 100;
  const medianClimbLevel = Math.round(median(climbLevels) * 100) / 100;
  const sdClimbLevel = Math.round(standardDeviation(climbLevels) * 100) / 100;
  const medianPointsContributed = Math.round(median(pointsContributed) * 100) / 100;
  const sdPointsContributed = Math.round(standardDeviation(pointsContributed) * 100) / 100;

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

  const stats = {
    median_auto_fuel: medianAutoFuel,
    sd_auto_fuel: sdAutoFuel,
    median_tele_fuel: medianTeleFuel,
    sd_tele_fuel: sdTeleFuel,
    median_climb_level: medianClimbLevel,
    sd_climb_level: sdClimbLevel,
    median_points_contributed: medianPointsContributed,
    sd_points_contributed: sdPointsContributed,
    local_consistency: localConsistency,
  };

  // Update the existing teamInfo record with the new stats
  const existing = await db.teamInfo.get([competitionCode, teamNumber]);
  if (existing) {
    await db.teamInfo.put({ ...existing, ...stats });
  }
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

  for (const teamNumber of teamNumbers) {
    await calculateTeamStats(compCode, teamNumber, playedMatches);
  }

  console.log('Team stats calculation completed');
}

/**
 * Calculate and store stats for a single team in the current competition.
 * Useful after saving a scouting record for a specific team.
 */
export async function calculateSingleTeamStats(teamNumber: number): Promise<void> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return;

  const allMatches = await db.matches
    .where('competitionCode')
    .equals(compCode)
    .toArray();

  const playedMatches = allMatches.filter((m) => m.has_played);
  if (playedMatches.length === 0) return;

  await calculateTeamStats(compCode, teamNumber, playedMatches);
}
