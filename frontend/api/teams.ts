import { Team, TeamInfo } from '@/types/team';
import { apiRequest } from '@/utils/api';
import { db } from '@/utils/db';

export class NoCompetitionCodeError extends Error {
  constructor() {
    super('No competition code set');
    this.name = 'NoCompetitionCodeError';
  }
}

export class NoTeamNumberError extends Error {
  constructor() {
    super('No team number provided');
    this.name = 'NoTeamNumberError';
  }
}

/**
 * Get all teams for a competition
 * @returns Array of teams at the competition
 * @throws NoCompetitionCodeError if no competition code is set
 */
export async function getTeams(): Promise<Team[]> {
  try {
    const competitionCode = (await db.config.get({ key: 'compCode' }))?.value;

    if (!competitionCode) {
      throw new NoCompetitionCodeError();
    }

    return await apiRequest<Team[]>(
      `/api/competitions/${competitionCode}/teams`,
    );
  } catch (error) {
    console.error('Failed to fetch teams:', error);
    throw error;
  }
}

/**
 * Get detailed information for a specific team at a competition
 * @param teamNumber - The team number to get info for
 * @param competitionCode - Optional competition code (uses stored code if not provided)
 * @returns Detailed team information including stats
 * @throws NoTeamNumberError if no team number is provided
 * @throws NoCompetitionCodeError if no competition code is set or provided
 */
export async function getTeamInfo(
  teamNumber: number,
  competitionCode?: string,
): Promise<TeamInfo> {
  try {
    if (!teamNumber) {
      throw new NoTeamNumberError();
    }

    let compCode = competitionCode;
    
    if (!compCode) {
      compCode = (await db.config.get({ key: 'compCode' }))?.value;
    }

    if (!compCode) {
      throw new NoCompetitionCodeError();
    }

    return await apiRequest<TeamInfo>(
      `/api/team-info?team_number=${teamNumber}&competition_code=${compCode}`,
    );
  } catch (error) {
    console.error('Failed to fetch team info:', error);
    throw error;
  }
}
