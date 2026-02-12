import React, { useState } from 'react';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { FlatList, Pressable } from 'react-native';
import { cssInterop } from 'nativewind';
import { deleteRecord } from '@/api/records';
import { db } from '@/utils/db';
import { MatchRecord, PrescoutRecord, PictureRecord } from '@/types/record';
import { useApp } from '@/contexts/AppContext';
import { Button, ButtonText } from '@/components/ui/button';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from '@/components/ui/actionsheet';
import { RecordCard } from '@/components/RecordCard';
import { RecordDetailModal } from '@/components/RecordDetailModal';
import { useRecords, UnifiedRecord } from '@/hooks/useRecords';

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
  const [selectedRecord, setSelectedRecord] = useState<UnifiedRecord | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const { triggerUpload } = useApp();
  const { records, isLoading } = useRecords();

  function handleRecordPress(record: UnifiedRecord) {
    setSelectedRecord(record);
    setIsDetailModalOpen(true);
  }

  function handleDetailModalClose() {
    setIsDetailModalOpen(false);
    setSelectedRecord(null);
  }

  async function handleDelete(record: UnifiedRecord) {
    try {
      await deleteRecord(record);
    } catch (err) {
      console.error('Failed to delete record:', err);
    }
  }

  async function handleRetry(record: UnifiedRecord) {
    try {
      const data = record.data;
      const updatedInfo = {
        ...data.info,
        status: 'pending',
        last_retry: Date.now(),
      };

      switch (record.type) {
        case 'match': {
          const matchData = data as MatchRecord;
          await db.matchRecords.put({
            ...matchData,
            info: updatedInfo,
          });
          break;
        }
        case 'prescout': {
          const prescoutData = data as PrescoutRecord;
          await db.prescoutRecords.put({
            ...prescoutData,
            info: updatedInfo,
          });
          break;
        }
        case 'picture': {
          const pictureData = data as PictureRecord;
          await db.pictureRecords.put({
            ...pictureData,
            info: updatedInfo,
          });
          break;
        }
      }

      // Trigger upload immediately
      triggerUpload();
    } catch (err) {
      console.error('Failed to retry record:', err);
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
          {isLoading ? (
            <Box className='flex-1 items-center justify-center px-4'>
              <Text className='text-typography-500'>Loading...</Text>
            </Box>
          ) : (
            <FlatList
              className='flex-1'
              data={records}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable onPress={() => handleRecordPress(item)}>
                  <RecordCard
                    record={item}
                    onDelete={handleDelete}
                    onRetry={handleRetry}
                  />
                </Pressable>
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
      <RecordDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleDetailModalClose}
        record={selectedRecord}
        onRecordUpdated={() => {}}
      />
    </Actionsheet>
  );
}
