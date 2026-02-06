/**
 * Calculate climb points based on climb level and phase (autonomous or teleop)
 *
 * Scoring Rules:
 * - Autonomous: 15 points for level 1 or higher
 * - Teleop: 10 points (L1), 20 points (L2), 30 points (L3)
 * - No climb: 0 points
 *
 * @param climbLevel - The climb level (0-3, or string like "L1", "L2", "L3")
 * @param isAutonomous - Whether the climb was during autonomous phase
 * @returns The points earned for the climb
 */
export function calculateClimbPoints(
  climbLevel?: number | string,
  isAutonomous: boolean = false,
): number {
  // Autonomous climb: 15 points if robot climbed in autonomous
  if (isAutonomous) {
    return 15;
  }
  let level: number;

  if (climbLevel === 'None' || climbLevel === undefined) {
    return 0;
  }

  if (typeof climbLevel === 'string') {
    // Handle string formats like "L1", "L2", "L3", or just "1", "2", "3"
    const match = climbLevel.match(/\d+/);
    level = match ? parseInt(match[0], 10) : 0;
  } else {
    level = climbLevel;
  }

  if (level < 0 || level > 3) {
    return 0;
  }

  return level * 10;
}

/**
 * Calculate total climb points for an alliance
 *
 * @param climbs - Array of climb data with level and autonomous flag
 * @returns Total climb points for the alliance
 */
export function calculateAllianceClimbPoints(
  climbs: Array<{ level: number | string; isAutonomous: boolean }>,
): number {
  return climbs.reduce((total, climb) => {
    return total + calculateClimbPoints(climb.level, climb.isAutonomous);
  }, 0);
}
