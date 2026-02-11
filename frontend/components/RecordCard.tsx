import React from 'react';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { UnifiedRecord } from '@/api/records';
import {
  Binoculars,
  Camera,
  ClipboardList,
  Clock,
  CloudCheck,
  CloudAlert,
  CloudUpload,
  Trash2,
} from 'lucide-react-native';
import { Progress, ProgressFilledTrack } from '@/components/ui/progress';
import { Button, ButtonIcon } from '@/components/ui/button';

function getStatusIcon(status: string) {
  switch (status) {
    case 'uploading':
      return CloudUpload;
    case 'synced':
      return CloudCheck;
    case 'failed':
    case 'error':
      return CloudAlert;
    default:
      return Clock;
  }
}

function getStatusAction(
  status: string,
): 'info' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'uploading':
      return 'warning';
    case 'synced':
      return 'success';
    case 'failed':
    case 'error':
      return 'error';
    default:
      return 'info';
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'match':
      return ClipboardList;
    case 'prescout':
      return Binoculars;
    case 'picture':
      return Camera;
    default:
      return ClipboardList;
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

interface RecordCardProps {
  record: UnifiedRecord;
  onArchive?: (record: UnifiedRecord) => void;
  compact?: boolean;
}

export function RecordCard({ record, onArchive, compact = false }: RecordCardProps) {
  const isSynced = record.status === 'synced';
  const isUploading = record.status === 'uploading';
  const StatusIcon = getStatusIcon(record.status);
  const TypeIcon = getTypeIcon(record.type);

  if (compact) {
    return (
      <HStack className='items-center gap-2'>
        <Badge
          size='sm'
          variant='solid'
          action={getStatusAction(record.status)}
          className='items-center'
        >
          <BadgeIcon as={StatusIcon} />
          <BadgeText className='capitalize ml-1'>{record.status}</BadgeText>
        </Badge>
        <Badge
          size='sm'
          variant='solid'
          action='muted'
          className='items-center'
        >
          <BadgeIcon as={TypeIcon} />
          <BadgeText className='capitalize ml-1'>{record.type}</BadgeText>
        </Badge>
        <Text className='text-typography-600 text-xs flex-1'>
          Team {record.teamNumber}
        </Text>
      </HStack>
    );
  }

  return (
    <Card
      variant='outline'
      className={`p-2 mb-2 ${isSynced ? 'opacity-50 bg-background-100' : ''}`}
    >
      {isUploading && (
        <Progress
          value={100}
          size='xs'
          orientation='horizontal'
          className='mb-2'
        >
          <ProgressFilledTrack className='bg-emerald-400 animate-pulse' />
        </Progress>
      )}
      <HStack space='sm' className='gap-2 items-center w-full'>
        <VStack space='sm' className='w-full'>
          <HStack className='justify-between items-center'>
            <HStack className='items-center gap-1'>
              <Badge
                size='sm'
                variant='solid'
                action={getStatusAction(record.status)}
                className='items-center'
              >
                <BadgeIcon as={StatusIcon} />
                <BadgeText className='capitalize ml-1'>
                  {record.status}
                </BadgeText>
              </Badge>
              <Badge
                size='sm'
                variant='solid'
                action='muted'
                className='items-center'
              >
                <BadgeIcon as={TypeIcon} />
                <BadgeText className='capitalize ml-1'>{record.type}</BadgeText>
              </Badge>
            </HStack>
            <Text className='text-typography-500 text-xs'>
              Created: {formatTimestamp(record.created_at)}
            </Text>
          </HStack>
          <HStack className='justify-between gap-1 items-center'>
            <Text className='text-typography-600 text-xs'>
              {record.type === 'match'
                ? 'Match scouting'
                : record.type === 'prescout'
                  ? 'Prescouting form'
                  : record.type === 'picture'
                    ? 'Picture'
                    : 'unknown'}{' '}
              for {record.teamNumber}
            </Text>
            {record.last_retry !== record.created_at && (
              <Text className='text-typography-500 text-xs'>
                Last retry: {formatTimestamp(record.last_retry)}
              </Text>
            )}
          </HStack>
        </VStack>

        {record.status === 'synced' && onArchive && (
          <Button
            variant='outline'
            size='xs'
            action='negative'
            className='m-0 px-2'
            onPress={() => onArchive(record)}
          >
            <ButtonIcon as={Trash2} />
          </Button>
        )}
      </HStack>
    </Card>
  );
}
