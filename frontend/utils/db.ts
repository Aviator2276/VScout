import Dexie, { Table } from 'dexie';
import { Platform } from 'react-native';

export interface Config {
  key: string;
  value: string;
}

class IndexDb extends Dexie {
  config!: Table<Config>;

  constructor() {
    super('vscout', {
      indexedDB: typeof window !== 'undefined' ? window.indexedDB : undefined,
      IDBKeyRange:
        typeof window !== 'undefined' ? window.IDBKeyRange : undefined,
    });

    this.version(1).stores({
      config: '&key, value',
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
