import { db } from '@/utils/db';
import { MatchRecord, PrescoutRecord, PictureRecord } from '@/types/record';

export type RecordType = 'match' | 'prescout' | 'picture';

export interface UnifiedRecord {
  type: RecordType;
  id: string;
  status: string;
  created_at: number;
  last_retry: number;
  archived: boolean;
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
    db.matchRecords.filter((r) => !r.info.archived).toArray(),
    db.prescoutRecords.filter((r) => !r.info.archived).toArray(),
    db.pictureRecords.filter((r) => !r.info.archived).toArray(),
  ]);

  const unifiedRecords: UnifiedRecord[] = [];

  matchRecords.forEach((record) => {
    unifiedRecords.push({
      type: 'match',
      id: `match-${record.info.competitionCode}-${record.match_type}-${record.set_number}-${record.match_number}-${record.team.number}`,
      status: record.info.status,
      created_at: record.info.created_at,
      last_retry: record.info.last_retry,
      archived: record.info.archived,
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
      archived: record.info.archived,
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
      archived: record.info.archived,
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

export async function archiveRecord(record: UnifiedRecord): Promise<void> {
  const updatedData = {
    ...record.data,
    info: { ...record.data.info, archived: true },
  };

  switch (record.type) {
    case 'match':
      await db.matchRecords.put(updatedData as MatchRecord);
      break;
    case 'prescout':
      await db.prescoutRecords.put(updatedData as PrescoutRecord);
      break;
    case 'picture':
      await db.pictureRecords.put(updatedData as PictureRecord);
      break;
  }
}
