import { db, markTeamScouted } from '@/utils/db';
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

interface BulkRobotActionsTeamResponse {
  team_number: number;
  auto: { duration: number; action: string; fuel?: number }[];
  tele: { duration: number; action: string; fuel?: number }[];
  auto_fuel: number;
  tele_fuel: number;
}

interface MatchRobotActionsResponse {
  teams: BulkRobotActionsTeamResponse[];
}

/**
 * Fetch robot actions for all teams in a match and store them in IndexedDB.
 * @param competitionCode The competition code
 * @param matchNumber The match number
 * @param matchType The match type (e.g., 'qualification')
 * @param setNumber The set number
 * @returns Number of team records stored
 */
export async function fetchMatchRobotActions(
  competitionCode: string,
  matchNumber: number,
  matchType: string,
  setNumber: number,
): Promise<number> {
  try {
    const response = await apiRequest<MatchRobotActionsResponse>(
      `/api/robot-actions/bulk?competition_code=${encodeURIComponent(competitionCode)}&match_number=${matchNumber}`,
    );

    let count = 0;
    for (const teamData of response.teams) {
      const record: RobotActionRecord = {
        competitionCode,
        match_type: matchType,
        set_number: setNumber,
        match_number: matchNumber,
        team_number: teamData.team_number,
        auto: teamData.auto.map((a) => ({
          duration: a.duration,
          action: a.action as RobotActionRecord['auto'][0]['action'],
          fuel: a.fuel,
        })),
        tele: teamData.tele.map((a) => ({
          duration: a.duration,
          action: a.action as RobotActionRecord['tele'][0]['action'],
          fuel: a.fuel,
        })),
        auto_fuel: teamData.auto_fuel,
        tele_fuel: teamData.tele_fuel,
      };

      await db.robotActions.put(record);

      // Mark team as scouted if there's actual timeline data
      if (teamData.auto.length > 0 || teamData.tele.length > 0) {
        await markTeamScouted(
          competitionCode,
          matchType,
          setNumber,
          matchNumber,
          teamData.team_number
        );
      }

      count++;
    }

    return count;
  } catch (error) {
    console.error(
      `Failed to fetch robot actions for match ${matchNumber}:`,
      error,
    );
    return 0;
  }
}

/**
 * Sync robot actions for all matches in the current competition.
 * Fetches all teams per match in a single API call.
 * @returns Number of robot action records synced
 */
export async function syncRobotActions(): Promise<number> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;

  if (!compCode) {
    throw new NoCompetitionCodeError();
  }

  try {
    // Get all completed matches for the current competition
    const allMatches = await db.matches
      .where('competitionCode')
      .equals(compCode)
      .toArray();

    // Only sync matches that have been played (not currently playing or in the future)
    const matches = allMatches.filter((match) => match.has_played);

    if (matches.length === 0) {
      console.log('No completed matches found, skipping robot actions sync');
      return 0;
    }

    console.log(`Syncing robot actions for ${matches.length} completed matches...`);

    let syncCount = 0;
    const batchSize = 5;

    // Process matches in batches
    for (let i = 0; i < matches.length; i += batchSize) {
      const batch = matches.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (match) => {
          try {
            const count = await fetchMatchRobotActions(
              compCode,
              match.match_number,
              match.match_type,
              match.set_number,
            );
            return count;
          } catch (error) {
            console.error(
              `Failed to sync robot actions for match ${match.match_number}:`,
              error,
            );
            return 0;
          }
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          syncCount += result.value;
        }
      }
    }

    console.log(`Robot actions sync completed: ${syncCount} records synced`);
    return syncCount;
  } catch (error) {
    console.error('Failed to sync robot actions:', error);
    throw error;
  }
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
