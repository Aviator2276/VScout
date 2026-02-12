import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
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

export interface RecordCounts {
  pending: number;
  uploading: number;
  synced: number;
  error: number;
  total: number;
}

export interface UseRecordsResult {
  records: UnifiedRecord[];
  counts: RecordCounts;
  isLoading: boolean;
}

export function useRecords(): UseRecordsResult {
  // Use live queries for real-time updates from IndexedDB
  const matchRecords = useLiveQuery(() => db.matchRecords.toArray(), []);
  const prescoutRecords = useLiveQuery(() => db.prescoutRecords.toArray(), []);
  const pictureRecords = useLiveQuery(() => db.pictureRecords.toArray(), []);

  const isLoading = matchRecords === undefined || prescoutRecords === undefined || pictureRecords === undefined;

  // Transform and sort records, memoized to avoid recalculation
  const records = useMemo(() => {
    if (isLoading) return [];

    const unifiedRecords: UnifiedRecord[] = [];

    matchRecords.forEach((record: MatchRecord) => {
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

    prescoutRecords.forEach((record: PrescoutRecord) => {
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

    pictureRecords.forEach((record: PictureRecord) => {
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
  }, [matchRecords, prescoutRecords, pictureRecords, isLoading]);

  // Calculate counts
  const counts = useMemo((): RecordCounts => {
    return {
      pending: records.filter((r) => r.status === 'pending').length,
      uploading: records.filter((r) => r.status === 'uploading').length,
      synced: records.filter((r) => r.status === 'synced').length,
      error: records.filter((r) => r.status === 'error').length,
      total: records.length,
    };
  }, [records]);

  return { records, counts, isLoading };
}
