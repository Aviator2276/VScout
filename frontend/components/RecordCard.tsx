import React from 'react';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { UnifiedRecord } from '@/hooks/useRecords';
import {
  Binoculars,
  Camera,
  ClipboardList,
  Clock,
  CloudCheck,
  CloudAlert,
  CloudUpload,
  Trash2,
  RefreshCw,
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
  onDelete?: (record: UnifiedRecord) => void;
  onRetry?: (record: UnifiedRecord) => void;
  compact?: boolean;
}

export function RecordCard({
  record,
  onDelete,
  onRetry,
  compact = false,
}: RecordCardProps) {
  const isSynced = record.status === 'synced';
  const isUploading = record.status === 'uploading';
  const StatusIcon = getStatusIcon(record.status);
  const TypeIcon = getTypeIcon(record.type);

  if (compact) {
    return (
      <Card
        variant='outline'
        className={`p-2 ${isSynced ? 'opacity-50 bg-background-100' : ''}`}
      >
        <HStack className='items-center gap-2'>
          <Badge
            size='sm'
            variant='solid'
            action={getStatusAction(record.status)}
            className={`items-center ${isUploading ? 'animate-pulse' : ''}`}
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
      </Card>
    );
  }

  return (
    <Card
      variant='outline'
      className={`p-2 mb-2 ${isSynced ? 'opacity-50 bg-background-100' : ''}`}
    >
      <HStack space='sm' className='gap-2 items-center w-full'>
        <VStack space='sm' className='w-full'>
          <HStack className='justify-between items-center'>
            <HStack className='items-center gap-1'>
              <Badge
                size='sm'
                variant='solid'
                action={getStatusAction(record.status)}
                className={`items-center ${isUploading ? 'animate-pulse' : ''}`}
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

        {record.status === 'synced' && onDelete && (
          <Button
            variant='outline'
            size='xs'
            action='negative'
            className='m-0 px-2'
            onPress={(e) => {
              e.stopPropagation();
              onDelete(record);
            }}
          >
            <ButtonIcon as={Trash2} />
          </Button>
        )}
        {(record.status === 'pending' || record.status === 'error') &&
          onRetry && (
            <Button
              variant='outline'
              size='xs'
              action='primary'
              className='m-0 px-2'
              onPress={(e) => {
                e.stopPropagation();
                onRetry(record);
              }}
            >
              <ButtonIcon as={RefreshCw} />
            </Button>
          )}
      </HStack>
    </Card>
  );
}
