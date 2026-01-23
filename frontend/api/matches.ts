import { Match } from '@/types/match';
import { apiRequest } from '@/config/api';
import { getCompetitionCode } from '@/utils/storage';

export class NoCompetitionCodeError extends Error {
  constructor() {
    super('No competition code set');
    this.name = 'NoCompetitionCodeError';
  }
}

export async function getMatches(): Promise<Match[]> {
  try {
    const competitionCode = await getCompetitionCode();

    if (!competitionCode) {
      throw new NoCompetitionCodeError();
    }

    return await apiRequest<Match[]>(
      `/api/competitions/${competitionCode}/matches`,
    );
  } catch (error) {
    console.error('Failed to fetch matches:', error);
    throw error;
  }
}
