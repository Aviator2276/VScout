import Dexie, { Table } from "dexie";
import { Platform } from "react-native";
import { Match } from "@/types/match";
import { Team, TeamInfo } from "@/types/team";

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
    super("vscout", {
      indexedDB: typeof window !== "undefined" ? window.indexedDB : undefined,
      IDBKeyRange:
        typeof window !== "undefined" ? window.IDBKeyRange : undefined,
    });

    // Version 4 - old schema with nested keys
    this.version(4).stores({
      config: "&key, value",
      matches:
        "[competition.code+match_type+set_number+match_number], match_number, set_number, match_type, start_match_time, end_match_time, blue_team_1.number, blue_team_2.number, blue_team_3.number, red_team_1.number, red_team_2.number, red_team_3.number",
      teams: "[competitionCode+number], number, name",
      teamInfo:
        "[competition.code+team_number], team_number, rank, ranking_points, tie, win, lose, prescout_range, prescout_climber",
    });

    // Version 5 - migration to flat keys (delete and recreate tables with primary key changes)
    this.version(5)
      .stores({
        config: "&key, value",
        matches:
          "[competitionCode+match_type+set_number+match_number], match_number, set_number, match_type, start_match_time, end_match_time",
        teams: "[competitionCode+number], number, name",
        teamInfo:
          "[competitionCode+team_number], team_number, rank, ranking_points, tie, win, lose, prescout_range, prescout_climber",
      })
      .upgrade((tx) => {
        // Clear all data from tables with changed primary keys
        // This is necessary because Dexie doesn't support changing primary keys
        return tx
          .table("matches")
          .clear()
          .then(() => tx.table("teamInfo").clear());
      });
  }
}

function createDb(): IndexDb {
  if (Platform.OS !== "web") {
    throw new Error("Database is only available on web platform");
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
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get device storage usage and limits using the Storage Manager API
 * @returns StorageInfo object with usage, quota, and formatted values
 */
export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return {
      usage: 0,
      quota: 0,
      usagePercentage: 0,
      usageFormatted: "N/A",
      quotaFormatted: "N/A",
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
    console.error("Failed to get storage estimate:", error);
    return {
      usage: 0,
      quota: 0,
      usagePercentage: 0,
      usageFormatted: "N/A",
      quotaFormatted: "N/A",
      available: false,
    };
  }
}
