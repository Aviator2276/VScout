import React, { useCallback, useState, useEffect, useRef } from 'react';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/card';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { Heading } from '@/components/ui/heading';
import { ActivityIndicator, FlatList } from 'react-native';
import { Center } from '@/components/ui/center';
import { useFocusEffect } from 'expo-router';
import { cssInterop } from 'nativewind';
import { getAllRecords, UnifiedRecord, archiveRecord } from '@/api/records';
import { PrescoutRecord, PictureRecord, MatchRecord } from '@/types/record';
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

cssInterop(FlatList, {
  className: {
    target: 'style',
  },
});

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

function RecordCard({
  record,
  onArchive,
}: {
  record: UnifiedRecord;
  onArchive: (record: UnifiedRecord) => void;
}) {
  const isSynced = record.status === 'synced';
  const isUploading = record.status === 'uploading';
  const StatusIcon = getStatusIcon(record.status);
  const TypeIcon = getTypeIcon(record.type);

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

        {record.status === 'synced' && (
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

export default function RecordsScreen() {
  const [records, setRecords] = useState<UnifiedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      loadRecords();

      return () => {
        setIsScreenFocused(false);
      };
    }, []),
  );

  // Poll for updates every 2 seconds while screen is focused
  useEffect(() => {
    if (!isScreenFocused) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const data = await getAllRecords();
        setRecords(data);
      } catch (err) {
        console.error('Failed to refresh records:', err);
      }
    }, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isScreenFocused]);

  async function loadRecords() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllRecords();
      setRecords(data);
    } catch (err) {
      console.error('Failed to load records:', err);
      setError('Failed to load records');
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive(record: UnifiedRecord) {
    try {
      await archiveRecord(record);
      // Refresh the list after archiving
      const data = await getAllRecords();
      setRecords(data);
    } catch (err) {
      console.error('Failed to archive record:', err);
    }
  }

  return (
    <AdaptiveSafeArea>
      <Box className='flex-1 max-w-2xl self-center w-full'>
        <Header title='Records' isMainScreen />
        {loading ? (
          <Center className='flex-1 px-4'>
            <ActivityIndicator size='large' />
          </Center>
        ) : error ? (
          <Center className='flex-1 px-4'>
            <Text className='text-center text-error-500 p-4'>{error}</Text>
          </Center>
        ) : (
          <FlatList
            className='flex-1 px-4'
            data={records}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <RecordCard record={item} onArchive={handleArchive} />
            )}
            ListEmptyComponent={() => (
              <Text className='text-center text-typography-500 mt-8'>
                No records available
              </Text>
            )}
          />
        )}
      </Box>
    </AdaptiveSafeArea>
  );
}
