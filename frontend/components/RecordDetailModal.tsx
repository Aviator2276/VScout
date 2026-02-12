import React from 'react';
import { ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { Button, ButtonText, ButtonIcon } from '@/components/ui/button';
import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@/components/ui/modal';
import { UnifiedRecord, deleteRecord } from '@/api/records';
import { db } from '@/utils/db';
import { MatchRecord, PrescoutRecord, PictureRecord } from '@/types/record';
import {
  Binoculars,
  Camera,
  ClipboardList,
  Clock,
  CloudCheck,
  CloudAlert,
  CloudUpload,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { useApp } from '@/contexts/AppContext';

interface RecordDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: UnifiedRecord | null;
  onRecordUpdated: () => void;
}

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
  return date.toLocaleString();
}

export function RecordDetailModal({
  isOpen,
  onClose,
  record,
  onRecordUpdated,
}: RecordDetailModalProps) {
  const { triggerUpload } = useApp();

  if (!record) return null;

  const StatusIcon = getStatusIcon(record.status);
  const TypeIcon = getTypeIcon(record.type);

  async function handleForceRetry() {
    if (!record) return;

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

      onRecordUpdated();
      triggerUpload();
      onClose();
    } catch (err) {
      console.error('Failed to force retry:', err);
    }
  }

  async function handleDelete() {
    if (!record) return;

    try {
      await deleteRecord(record);
      onRecordUpdated();
      onClose();
    } catch (err) {
      console.error('Failed to delete record:', err);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size='lg'>
      <ModalBackdrop />
      <ModalContent>
        <ModalHeader>
          <VStack className='flex-1'>
            <Heading size='lg'>Record Details</Heading>
            <HStack className='items-center gap-2 mt-2'>
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
          </VStack>
          <ModalCloseButton>
            <Icon as={X} size='md' className='text-typography-500' />
          </ModalCloseButton>
        </ModalHeader>

        <ModalBody>
          <ScrollView className='max-h-96'>
            <VStack space='md'>
              <VStack space='xs'>
                <Text className='text-typography-500 text-sm font-semibold'>
                  Team
                </Text>
                <Text className='text-typography-900'>
                  {record.teamNumber} - {record.teamName}
                </Text>
              </VStack>

              <VStack space='xs'>
                <Text className='text-typography-500 text-sm font-semibold'>
                  Competition
                </Text>
                <Text className='text-typography-900'>
                  {record.competitionCode}
                </Text>
              </VStack>

              <VStack space='xs'>
                <Text className='text-typography-500 text-sm font-semibold'>
                  Created At
                </Text>
                <Text className='text-typography-900'>
                  {formatTimestamp(record.created_at)}
                </Text>
              </VStack>

              <VStack space='xs'>
                <Text className='text-typography-500 text-sm font-semibold'>
                  Last Retry
                </Text>
                <Text className='text-typography-900'>
                  {formatTimestamp(record.last_retry)}
                </Text>
              </VStack>

              <VStack space='xs'>
                <Text className='text-typography-500 text-sm font-semibold'>
                  Record Data (JSON)
                </Text>
                <ScrollView
                  horizontal
                  className='bg-background-100 rounded-md p-3'
                >
                  <Text className='text-typography-700 font-mono text-xs'>
                    {JSON.stringify(record.data, null, 2)}
                  </Text>
                </ScrollView>
              </VStack>
            </VStack>
          </ScrollView>
        </ModalBody>

        <ModalFooter>
          <HStack space='sm' className='w-full'>
            <Button
              variant='outline'
              action='primary'
              className='flex-1'
              onPress={handleForceRetry}
              isDisabled={record.status === 'uploading'}
            >
              <ButtonIcon as={RefreshCw} className='mr-1' />
              <ButtonText>Retry</ButtonText>
            </Button>
            <Button
              variant='solid'
              action='negative'
              className='flex-1'
              onPress={handleDelete}
            >
              <ButtonIcon as={Trash2} className='mr-1' />
              <ButtonText>Delete</ButtonText>
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
