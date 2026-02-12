import { db } from '@/utils/db';
import { MatchRecord, PrescoutRecord, PictureRecord } from '@/types/record';

export type RecordType = 'match' | 'prescout' | 'picture';

export interface UnifiedRecord {
  type: RecordType;
  id: string;
  status: string;
  created_at: number;
  last_retry: number;
  competitionCode: string;
  teamNumber: number;
  teamName: string;
  data: MatchRecord | PrescoutRecord | PictureRecord;
}

function getStatusPriority(status: string): number {
  switch (status) {
    case 'uploading':
      return 0;
    case 'pending':
      return 1;
    case 'synced':
      return 2;
    default:
      return 1;
  }
}

export async function getAllRecords(): Promise<UnifiedRecord[]> {
  const [matchRecords, prescoutRecords, pictureRecords] = await Promise.all([
    db.matchRecords.toArray(),
    db.prescoutRecords.toArray(),
    db.pictureRecords.toArray(),
  ]);

  const unifiedRecords: UnifiedRecord[] = [];

  matchRecords.forEach((record) => {
    unifiedRecords.push({
      type: 'match',
      id: `match-${record.info.competitionCode}-${record.match_type}-${record.set_number}-${record.match_number}-${record.team.number}`,
      status: record.info.status,
      created_at: record.info.created_at,
      last_retry: record.info.last_retry,
      competitionCode: record.info.competitionCode,
      teamNumber: record.team.number,
      teamName: record.team.name,
      data: record,
    });
  });

  prescoutRecords.forEach((record) => {
    unifiedRecords.push({
      type: 'prescout',
      id: `prescout-${record.info.competitionCode}-${record.team.number}`,
      status: record.info.status,
      created_at: record.info.created_at,
      last_retry: record.info.last_retry,
      competitionCode: record.info.competitionCode,
      teamNumber: record.team.number,
      teamName: record.team.name,
      data: record,
    });
  });

  pictureRecords.forEach((record) => {
    unifiedRecords.push({
      type: 'picture',
      id: `picture-${record.info.competitionCode}-${record.team.number}`,
      status: record.info.status,
      created_at: record.info.created_at,
      last_retry: record.info.last_retry,
      competitionCode: record.info.competitionCode,
      teamNumber: record.team.number,
      teamName: record.team.name,
      data: record,
    });
  });

  // Sort by status priority (uploading first, then pending, then synced)
  // Within same priority, sort by created_at descending (newest first)
  unifiedRecords.sort((a, b) => {
    const priorityDiff = getStatusPriority(a.status) - getStatusPriority(b.status);
    if (priorityDiff !== 0) return priorityDiff;
    return b.created_at - a.created_at;
  });

  return unifiedRecords;
}

export async function deleteRecord(record: UnifiedRecord): Promise<void> {
  const data = record.data;
  switch (record.type) {
    case 'match': {
      const matchData = data as MatchRecord;
      await db.matchRecords
        .where('[info.competitionCode+match_type+set_number+match_number+team.number]')
        .equals([
          matchData.info.competitionCode,
          matchData.match_type,
          matchData.set_number,
          matchData.match_number,
          matchData.team.number,
        ])
        .delete();
      break;
    }
    case 'prescout': {
      const prescoutData = data as PrescoutRecord;
      await db.prescoutRecords
        .where('[info.competitionCode+team.number]')
        .equals([prescoutData.info.competitionCode, prescoutData.team.number])
        .delete();
      break;
    }
    case 'picture': {
      const pictureData = data as PictureRecord;
      await db.pictureRecords
        .where('[info.competitionCode+team.number]')
        .equals([pictureData.info.competitionCode, pictureData.team.number])
        .delete();
      break;
    }
  }
}
