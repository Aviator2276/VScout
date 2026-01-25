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

    this.version(2).stores({
      config: '&key, value',
      matches:
        '[competition.code+match_number], match_number, set_number, match_type, start_match_time, end_match_time, blue_team_1.number, blue_team_2.number, blue_team_3.number, red_team_1.number, red_team_2.number, red_team_3.number',
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
