import { db } from '@/utils/db';
import { apiRequest } from '@/utils/api';
import { ScoutRecord } from '@/types/record';
import { RobotActionRecord } from '@/types/scouting';
import { getTeamName } from './teams';

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

interface UploadScoutPayload {
  team_number: number;
  competition_code: string;
  match_number: number;
  is_playoff: boolean;
  notes?: string;
  auto: { duration: number; action: string }[];
  tele: { duration: number; action: string }[];
}

/**
 * Save a scout record to local IndexedDB for later upload.
 * This creates a pending record that will be uploaded when connectivity is available.
 * @param robotActionRecord The robot action record from the scouting session
 * @returns The created scout record
 */
export async function saveScoutRecord(
  robotActionRecord: RobotActionRecord,
): Promise<ScoutRecord> {
  const compCode = robotActionRecord.competitionCode;

  if (!compCode) {
    throw new NoCompetitionCodeError();
  }

  if (!robotActionRecord.team_number) {
    throw new NoTeamNumberError();
  }

  const teamName = await getTeamName(robotActionRecord.team_number);

  const scoutRecord: ScoutRecord = {
    info: {
      status: 'pending',
      competitionCode: compCode,
      created_at: Date.now(),
      last_retry: 0,
    },
    team: {
      number: robotActionRecord.team_number,
      name: teamName || `Team ${robotActionRecord.team_number}`,
    },
    match_type: robotActionRecord.match_type,
    set_number: robotActionRecord.set_number,
    match_number: robotActionRecord.match_number,
    is_playoff: robotActionRecord.match_type !== 'qualification',
    notes: robotActionRecord.notes,
    auto: robotActionRecord.auto,
    tele: robotActionRecord.tele,
  };

  // Check if a record already exists for this team/match combo
  const existing = await db.scoutRecords
    .where('[info.competitionCode+match_type+set_number+match_number+team.number]')
    .equals([
      compCode,
      scoutRecord.match_type,
      scoutRecord.set_number,
      scoutRecord.match_number,
      scoutRecord.team.number,
    ])
    .first();

  if (existing) {
    // Update existing record
    await db.scoutRecords.put({
      ...scoutRecord,
      info: {
        ...scoutRecord.info,
        created_at: existing.info.created_at,
      },
    });
  } else {
    await db.scoutRecords.put(scoutRecord);
  }

  return scoutRecord;
}

/**
 * Upload a scout record to the server.
 * @param scoutRecord The scout record to upload
 */
export async function uploadScoutRecord(scoutRecord: ScoutRecord): Promise<void> {
  const payload: UploadScoutPayload = {
    team_number: scoutRecord.team.number,
    competition_code: scoutRecord.info.competitionCode,
    match_number: scoutRecord.match_number,
    is_playoff: scoutRecord.is_playoff,
    notes: scoutRecord.notes,
    auto: scoutRecord.auto,
    tele: scoutRecord.tele,
  };

  // Update status to uploading
  await db.scoutRecords
    .where('[info.competitionCode+match_type+set_number+match_number+team.number]')
    .equals([
      scoutRecord.info.competitionCode,
      scoutRecord.match_type,
      scoutRecord.set_number,
      scoutRecord.match_number,
      scoutRecord.team.number,
    ])
    .modify({ 'info.status': 'uploading', 'info.last_retry': Date.now() });

  try {
    await apiRequest('/api/robot-actions/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    // Update status to synced
    await db.scoutRecords
      .where('[info.competitionCode+match_type+set_number+match_number+team.number]')
      .equals([
        scoutRecord.info.competitionCode,
        scoutRecord.match_type,
        scoutRecord.set_number,
        scoutRecord.match_number,
        scoutRecord.team.number,
      ])
      .modify({ 'info.status': 'synced' });
  } catch (error) {
    // Revert status to pending on failure
    await db.scoutRecords
      .where('[info.competitionCode+match_type+set_number+match_number+team.number]')
      .equals([
        scoutRecord.info.competitionCode,
        scoutRecord.match_type,
        scoutRecord.set_number,
        scoutRecord.match_number,
        scoutRecord.team.number,
      ])
      .modify({ 'info.status': 'pending' });

    console.error('Failed to upload scout record:', error);
    throw error;
  }
}

/**
 * Upload all pending scout records.
 * @returns Number of successfully uploaded records
 */
export async function uploadPendingScoutRecords(): Promise<number> {
  const pendingRecords = await db.scoutRecords
    .filter((record) => record.info.status === 'pending')
    .toArray();

  let successCount = 0;

  for (const record of pendingRecords) {
    try {
      await uploadScoutRecord(record);
      successCount++;
    } catch (error) {
      console.error(
        `Failed to upload scout record for team ${record.team.number} match ${record.match_number}:`,
        error,
      );
    }
  }

  return successCount;
}

/**
 * Get all scout records from local IndexedDB.
 * @returns Array of scout records
 */
export async function getScoutRecords(): Promise<ScoutRecord[]> {
  return db.scoutRecords.toArray();
}

/**
 * Delete a scout record from local IndexedDB.
 * @param scoutRecord The scout record to delete
 */
export async function deleteScoutRecord(scoutRecord: ScoutRecord): Promise<void> {
  await db.scoutRecords
    .where('[info.competitionCode+match_type+set_number+match_number+team.number]')
    .equals([
      scoutRecord.info.competitionCode,
      scoutRecord.match_type,
      scoutRecord.set_number,
      scoutRecord.match_number,
      scoutRecord.team.number,
    ])
    .delete();
}
