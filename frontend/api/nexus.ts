import { db } from '@/utils/db';

const NEXUS_API_BASE = 'https://frc.nexus/api/v1';

class NoCompetitionCodeError extends Error {
  constructor() {
    super('No competition code set');
    this.name = 'NoCompetitionCodeError';
  }
}

export interface MapElement {
  position: { x: number; y: number };
  size: { x: number; y: number };
}

export interface PitMapPit extends MapElement {
  team: string | null;
}

export interface PitMapArea extends MapElement {
  label: string;
}

export interface PitMapLabel extends MapElement {
  label: string;
}

export interface PitMapArrow extends MapElement {
  type: string;
  angle?: number;
}

export interface PitMap {
  size: { x: number; y: number };
  pits: Record<string, PitMapPit>;
  areas: Record<string, PitMapArea> | null;
  labels: Record<string, PitMapLabel> | null;
  arrows: Record<string, PitMapArrow> | null;
  walls: Record<string, MapElement> | null;
}

export type PitAddresses = Record<string, string>;

export interface NexusData {
  competitionCode: string;
  map: PitMap | null;
  pits: PitAddresses | null;
}

async function nexusFetch<T>(endpoint: string): Promise<T> {
  const apiKey = process.env.EXPO_PUBLIC_NEXUS_API;
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_NEXUS_API key is not set');
  }

  const response = await fetch(`${NEXUS_API_BASE}${endpoint}`, {
    headers: {
      'Nexus-Api-Key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Nexus API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch pit map and pit addresses from the Nexus API and cache them in IndexedDB.
 * Uses the stored competition code as the event key.
 * @returns The cached NexusData
 */
export async function cacheNexusData(): Promise<NexusData> {
  const competitionCode = (await db.config.get({ key: 'compCode' }))?.value;

  if (!competitionCode) {
    throw new NoCompetitionCodeError();
  }

  try {
    const [map, pits] = await Promise.all([
      nexusFetch<PitMap>(`/event/${competitionCode}/map`).catch((err) => {
        console.error('Failed to fetch Nexus pit map:', err);
        return null;
      }),
      nexusFetch<PitAddresses>(`/event/${competitionCode}/pits`).catch((err) => {
        console.error('Failed to fetch Nexus pit addresses:', err);
        return null;
      }),
    ]);

    const nexusData: NexusData = {
      competitionCode,
      map,
      pits,
    };

    await db.nexus.where('competitionCode').equals(competitionCode).delete();
    await db.nexus.put(nexusData);

    return nexusData;
  } catch (error) {
    console.error('Failed to cache Nexus data:', error);
    throw error;
  }
}

/**
 * Get cached Nexus data for the current competition from IndexedDB.
 * @returns The cached NexusData or undefined if not cached
 */
export async function getNexusData(): Promise<NexusData | undefined> {
  const competitionCode = (await db.config.get({ key: 'compCode' }))?.value;

  if (!competitionCode) {
    throw new NoCompetitionCodeError();
  }

  try {
    return await db.nexus
      .where('competitionCode')
      .equals(competitionCode)
      .first();
  } catch (error) {
    console.error('Failed to get Nexus data from cache:', error);
    throw error;
  }
}
