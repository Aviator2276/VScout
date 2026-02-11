import React, { useState, useEffect, useRef } from 'react';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { ActivityIndicator, FlatList } from 'react-native';
import { Center } from '@/components/ui/center';
import { cssInterop } from 'nativewind';
import { getAllRecords, UnifiedRecord, archiveRecord } from '@/api/records';
import { Button, ButtonText } from '@/components/ui/button';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from '@/components/ui/actionsheet';
import { RecordCard } from '@/components/RecordCard';

cssInterop(FlatList, {
  className: {
    target: 'style',
  },
});

interface RecordsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RecordsSheet({ isOpen, onClose }: RecordsSheetProps) {
  const [records, setRecords] = useState<UnifiedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  useEffect(() => {
    if (isOpen) {
      loadRecords();
      // Start polling when sheet opens
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const data = await getAllRecords();
          setRecords(data);
        } catch (err) {
          console.error('Failed to refresh records:', err);
        }
      }, 2000);
    } else {
      // Stop polling when sheet closes
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isOpen]);

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
      const data = await getAllRecords();
      setRecords(data);
    } catch (err) {
      console.error('Failed to archive record:', err);
    }
  }

  return (
    <Actionsheet isOpen={isOpen} onClose={onClose}>
      <ActionsheetBackdrop />
      <ActionsheetContent className='w-full h-[calc(100%-4rem)]'>
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>
        <Box className='flex-1 w-full max-w-2xl self-center'>
          <Heading size='lg' className='text-center mb-4 mt-2'>
            Uploaded Records
          </Heading>
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
              className='flex-1'
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
          <Button
            size='lg'
            action='secondary'
            className='w-full mb-4 mt-4'
            onPress={onClose}
          >
            <ButtonText>Close</ButtonText>
          </Button>
        </Box>
      </ActionsheetContent>
    </Actionsheet>
  );
}
