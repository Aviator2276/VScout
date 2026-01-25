import { apiRequest } from '@/utils/api';

export interface Competition {
  name: string;
  code: string;
}

export async function getCompetitions(): Promise<Competition[]> {
  try {
    return await apiRequest<Competition[]>('/api/competitions');
  } catch (error) {
    console.error('Failed to fetch competitions:', error);
    throw error;
  }
}
