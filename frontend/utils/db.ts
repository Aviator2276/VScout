import Dexie, { Table } from 'dexie';
import { Platform } from 'react-native';
import { Match } from '@/types/match';
import { Team, TeamInfo } from '@/types/team';
import { MatchRecord, PrescoutRecord, PictureRecord } from '@/types/record';
import { MatchVideo } from '@/types/video';

export interface Config {
  key: string;
  value: string;
}

class IndexDb extends Dexie {
  config!: Table<Config>;
  matches!: Table<Match>;
  teams!: Table<Team>;
  teamInfo!: Table<TeamInfo>;
  matchRecords!: Table<MatchRecord>;
  prescoutRecords!: Table<PrescoutRecord>;
  pictureRecords!: Table<PictureRecord>;
  matchVideos!: Table<MatchVideo>;

  constructor() {
    super('vscout', {
      indexedDB: typeof window !== 'undefined' ? window.indexedDB : undefined,
      IDBKeyRange:
        typeof window !== 'undefined' ? window.IDBKeyRange : undefined,
    });

    // Increment version number when changing table schema to migrate.
    this.version(12).stores({
      config: '&key, value',
      matches:
        '[competitionCode+match_type+set_number+match_number], match_number, set_number, match_type, start_match_time, end_match_time, blue_team_1.number, blue_team_2.number, blue_team_3.number, red_team_1.number, red_team_2.number, red_team_3.number',
      teams: '[competitionCode+number], number, name',
      teamInfo:
        '[competitionCode+team_number], team_number, rank, ranking_points, tie, win, lose, prescout_range, prescout_climber, pictureHash',
      matchRecords:
        '[info.competitionCode+match_type+set_number+match_number+team.number]',
      prescoutRecords:
        '[info.competitionCode+team.number], info.status, info.created_at, info.last_retry, team.number, team.name',
      pictureRecords:
        '[info.competitionCode+team.number], info.status, info.created_at, info.last_retry, team.number, team.name',
      matchVideos:
        '[competitionCode+match_number], match_number, match_type, isAvailable, isDownloaded',
    });
  }
}

function createDb(): IndexDb {
  if (Platform.OS !== 'web') {
    throw new Error('Database is only available on web platform');
  }
  return new IndexDb();
}

export const db = createDb();

export interface StorageInfo {
  usage: number;
  quota: number;
  usagePercentage: number;
  usageFormatted: string;
  quotaFormatted: string;
  available: boolean;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get device storage usage and limits using the Storage Manager API
 * @returns StorageInfo object with usage, quota, and formatted values
 */
export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate()) {
    return {
      usage: 0,
      quota: 0,
      usagePercentage: 0,
      usageFormatted: 'N/A',
      quotaFormatted: 'N/A',
      available: false,
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const usagePercentage = quota > 0 ? (usage / quota) * 100 : 0;

    return {
      usage,
      quota,
      usagePercentage,
      usageFormatted: formatBytes(usage),
      quotaFormatted: formatBytes(quota),
      available: true,
    };
  } catch (error) {
    console.error('Failed to get storage estimate:', error);
    return {
      usage: 0,
      quota: 0,
      usagePercentage: 0,
      usageFormatted: 'N/A',
      quotaFormatted: 'N/A',
      available: false,
    };
  }
}
