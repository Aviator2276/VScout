import Dexie, { Table } from 'dexie';
import { Platform } from 'react-native';
import { Match } from '@/types/match';
import { Team, TeamInfo } from '@/types/team';

export interface Config {
  key: string;
  value: string;
}

class IndexDb extends Dexie {
  config!: Table<Config>;
  matches!: Table<Match>;
  teams!: Table<Team>;
  teamInfo!: Table<TeamInfo>;

  constructor() {
    super('vscout', {
      indexedDB: typeof window !== 'undefined' ? window.indexedDB : undefined,
      IDBKeyRange:
        typeof window !== 'undefined' ? window.IDBKeyRange : undefined,
    });

    // Increment version number when changing table schema to migrate.
    this.version(3).stores({
      config: '&key, value',
      matches:
        '[competition.code+match_type+set_number+match_number], match_number, set_number, match_type, start_match_time, end_match_time, blue_team_1.number, blue_team_2.number, blue_team_3.number, red_team_1.number, red_team_2.number, red_team_3.number',
      teams: '[competitionCode+number], number, name',
      teamInfo:
        '[competition.code+team.number], team.number, team.name, ranking_points, tie, win, lose, prescout_range, prescout_climber',
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

export interface TableStorageInfo {
  name: string;
  count: number;
  estimatedSize: number;
  estimatedSizeFormatted: string;
  percentage: number;
  color: string;
}

export interface StorageBreakdown extends StorageInfo {
  tables: TableStorageInfo[];
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
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
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

/**
 * Get storage breakdown by table with color coding
 * @returns StorageBreakdown with per-table information
 */
export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const baseInfo = await getStorageInfo();

  if (!baseInfo.available) {
    return {
      ...baseInfo,
      tables: [],
    };
  }

  try {
    const [configCount, matchesCount, teamsCount, teamInfoCount] =
      await Promise.all([
        db.config.count(),
        db.matches.count(),
        db.teams.count(),
        db.teamInfo.count(),
      ]);

    // Estimation in Bytes
    const avgConfigSize = 100;
    const avgMatchSize = 2000;
    const avgTeamSize = 150;
    const avgTeamInfoSize = 1500;

    const configSize = configCount * avgConfigSize;
    const matchesSize = matchesCount * avgMatchSize;
    const teamsSize = teamsCount * avgTeamSize;
    const teamInfoSize = teamInfoCount * avgTeamInfoSize;
    const totalDbSize = configSize + matchesSize + teamsSize + teamInfoSize;

    const appDataSize = Math.max(0, baseInfo.usage - totalDbSize);

    const tables: TableStorageInfo[] = [
      {
        name: 'App Data',
        count: 0,
        estimatedSize: appDataSize,
        estimatedSizeFormatted: formatBytes(appDataSize),
        percentage: 0,
        color: '#ef4444', // red
      },
      {
        name: 'Config',
        count: configCount,
        estimatedSize: configSize,
        estimatedSizeFormatted: formatBytes(configSize),
        percentage: 0,
        color: '#3b82f6', // blue
      },
      {
        name: 'Matches',
        count: matchesCount,
        estimatedSize: matchesSize,
        estimatedSizeFormatted: formatBytes(matchesSize),
        percentage: 0,
        color: '#10b981', // green
      },
      {
        name: 'Teams',
        count: teamsCount,
        estimatedSize: teamsSize,
        estimatedSizeFormatted: formatBytes(teamsSize),
        percentage: 0,
        color: '#f59e0b', // amber
      },
      {
        name: 'Team Info',
        count: teamInfoCount,
        estimatedSize: teamInfoSize,
        estimatedSizeFormatted: formatBytes(teamInfoSize),
        percentage: 0,
        color: '#8b5cf6', // purple
      },
    ];

    // Calculate percentages based on actual total usage
    if (baseInfo.usage > 0) {
      tables.forEach((table) => {
        table.percentage = (table.estimatedSize / baseInfo.usage) * 100;
      });
    }

    return {
      ...baseInfo,
      tables,
    };
  } catch (error) {
    console.error('Failed to get storage breakdown:', error);
    return {
      ...baseInfo,
      tables: [],
    };
  }
}
