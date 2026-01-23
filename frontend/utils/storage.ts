import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

async function getDatabase() {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('vibescout.db');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

export async function initDatabase(): Promise<void> {
  await getDatabase();
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    const database = await getDatabase();
    const result = await database.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key],
    );
    return result?.value || null;
  } catch (error) {
    console.error('Failed to get setting:', error);
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, value],
    );
  } catch (error) {
    console.error('Failed to set setting:', error);
    throw error;
  }
}

export async function resetDatabase(): Promise<void> {
  try {
    const database = await getDatabase();
    await database.execAsync('DELETE FROM settings');
    db = null;
  } catch (error) {
    console.error('Failed to reset database:', error);
    throw error;
  }
}

export async function getName(): Promise<string | null> {
  return await getSetting('name');
}

export async function setName(name: string): Promise<void> {
  await setSetting('name', name);
}

export async function getCompetitionCode(): Promise<string | null> {
  return process.env.COMPCODE || (await getSetting('competitionCode'));
}

export async function setCompetitionCode(code: string): Promise<void> {
  await setSetting('competitionCode', code);
}
