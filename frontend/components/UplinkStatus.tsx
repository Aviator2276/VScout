import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Pressable } from 'react-native';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  Popover,
  PopoverBackdrop,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverArrow,
} from '@/components/ui/popover';
import {
  LucideIcon,
  CloudUpload,
  CheckCircle,
  Clock,
  AlertCircle,
  CloudCheck,
  CloudAlert,
  HardDrive,
  CloudSync,
} from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/utils/db';
import { uploadPrescout, uploadTeamPicture } from '@/api/teams';
import { PrescoutRecord } from '@/types/record';
import { useRecords } from '@/hooks/useRecords';

interface UplinkStatusProps {
  size?: 'sm' | 'md' | 'lg';
}

type UplinkState = 'idle' | 'uploading' | 'error' | 'success';

const STATUS_CONFIG: Record<
  UplinkState,
  {
    action: 'success' | 'warning' | 'error' | 'muted';
    icon: LucideIcon;
    label: string;
    description: string;
  }
> = {
  idle: {
    action: 'muted',
    icon: HardDrive,
    label: 'Idle',
    description: 'No pending uploads.',
  },
  success: {
    action: 'success',
    icon: CloudCheck,
    label: 'Synced',
    description: 'All records uploaded successfully.',
  },
  uploading: {
    action: 'warning',
    icon: CloudUpload,
    label: 'Uploading',
    description: 'Uploading records to server...',
  },
  error: {
    action: 'error',
    icon: CloudAlert,
    label: 'Error',
    description: 'Some uploads failed.',
  },
};

export function UplinkStatus({ size = 'lg' }: UplinkStatusProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [lastUploadTime, setLastUploadTime] = useState<Date | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);

  const { isOnline } = useApp();
  const { counts } = useRecords();

  // Derive counts and state from useRecords hook
  const { pending: pendingCount, uploading: uploadingCount, synced: syncedCount, error: errorCount } = counts;

  const uplinkState = useMemo((): UplinkState => {
    if (uploadingCount > 0) return 'uploading';
    if (errorCount > 0) return 'error';
    if (pendingCount > 0) return 'idle';
    if (syncedCount > 0) return 'success';
    return 'idle';
  }, [pendingCount, uploadingCount, syncedCount, errorCount]);

  const processUploadQueue = useCallback(async () => {
    if (!isOnline || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      // Get pending prescout records
      const pendingPrescouts = await db.prescoutRecords
        .filter((r) => r.info.status === 'pending')
        .toArray();

      for (const record of pendingPrescouts) {
        try {
          // Update status to uploading
          await db.prescoutRecords.put({
            ...record,
            info: {
              ...record.info,
              status: 'uploading',
              last_retry: Date.now(),
            },
          });
          // Upload to server
          await uploadPrescout(record.team.number, {
            prescout_drivetrain: record.prescout_drivetrain,
            prescout_hopper_size: record.prescout_hopper_size,
            prescout_intake_type: record.prescout_intake_type,
            prescout_rotate_yaw: record.prescout_rotate_yaw,
            prescout_rotate_pitch: record.prescout_rotate_pitch,
            prescout_range: record.prescout_range,
            prescout_driver_years: record.prescout_driver_years,
            prescout_additional_comments: record.prescout_additional_comments,
          });

          // Update status to synced
          await db.prescoutRecords.put({
            ...record,
            info: { ...record.info, status: 'synced', last_retry: Date.now() },
          });

          setLastUploadTime(new Date());
        } catch (error) {
          console.error('Failed to upload prescout record:', error);
          // Update status to error
          await db.prescoutRecords.put({
            ...record,
            info: { ...record.info, status: 'error', last_retry: Date.now() },
          });
        }
      }

      // Get pending picture records
      const pendingPictures = await db.pictureRecords
        .filter((r) => r.info.status === 'pending')
        .toArray();

      for (const record of pendingPictures) {
        try {
          // Update status to uploading
          await db.pictureRecords.put({
            ...record,
            info: {
              ...record.info,
              status: 'uploading',
              last_retry: Date.now(),
            },
          });
          // Upload picture to server
          await uploadTeamPicture(record.team.number, record.picture);

          await db.pictureRecords.put({
            ...record,
            info: { ...record.info, status: 'synced', last_retry: Date.now() },
          });

          setLastUploadTime(new Date());
        } catch (error) {
          console.error('Failed to upload picture record:', error);
          // Update status to error
          await db.pictureRecords.put({
            ...record,
            info: { ...record.info, status: 'error', last_retry: Date.now() },
          });
        }
      }

    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [isOnline]);

  const { registerUploadHandler } = useApp();

  // Register upload handler with context so other components can trigger uploads
  useEffect(() => {
    registerUploadHandler(processUploadQueue);
  }, [registerUploadHandler, processUploadQueue]);

  // Periodic upload processing (every 30 seconds)
  useEffect(() => {
    if (!isOnline) return;

    // Process immediately when coming online
    processUploadQueue();

    const interval = setInterval(() => {
      processUploadQueue();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const handleForceUpload = async () => {
    await processUploadQueue();
  };

  const handleRetryFailed = async () => {
    // Reset error records to pending
    const errorPrescouts = await db.prescoutRecords
      .filter((r) => r.info.status === 'error')
      .toArray();

    for (const record of errorPrescouts) {
      await db.prescoutRecords.put({
        ...record,
        info: { ...record.info, status: 'pending' },
      });
    }

    const errorPictures = await db.pictureRecords
      .filter((r) => r.info.status === 'error')
      .toArray();

    for (const record of errorPictures) {
      await db.pictureRecords.put({
        ...record,
        info: { ...record.info, status: 'pending' },
      });
    }

    await processUploadQueue();
  };

  const config = STATUS_CONFIG[uplinkState];

  return (
    <Popover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onOpen={() => setIsOpen(true)}
      placement='bottom'
      size='sm'
      trigger={(triggerProps) => (
        <Pressable {...triggerProps}>
          <Badge
            size={size}
            variant='solid'
            action={isProcessing ? 'warning' : config.action}
          >
            {isProcessing ? (
              <BadgeIcon
                as={CloudUpload}
                className='my-[0.1rem] animate-pulse'
              />
            ) : (
              <BadgeIcon as={config.icon} className='my-[0.1rem]' />
            )}
            {pendingCount > 0 && (
              <BadgeText className='ml-1'>{pendingCount}</BadgeText>
            )}
          </Badge>
        </Pressable>
      )}
    >
      <PopoverBackdrop />
      <PopoverContent>
        <PopoverArrow />
        <PopoverHeader className='mb-2'>
          <Text size='sm' className='text-typography-600'>
            {config.description}
          </Text>
        </PopoverHeader>
        <PopoverBody className='mb-2'>
          <Text size='sm' className='text-typography-500'>
            <Text size='sm' className='font-semibold'>
              Pending:
            </Text>{' '}
            {pendingCount}
          </Text>
          <Text size='sm' className='text-typography-500'>
            <Text size='sm' className='font-semibold'>
              Uploading:
            </Text>{' '}
            {uploadingCount}
          </Text>
          <Text size='sm' className='text-typography-500'>
            <Text size='sm' className='font-semibold'>
              Synced:
            </Text>{' '}
            {syncedCount}
          </Text>
          {errorCount > 0 && (
            <Text size='sm' className='text-error-500'>
              <Text size='sm' className='font-semibold'>
                Failed:
              </Text>{' '}
              {errorCount}
            </Text>
          )}
          {lastUploadTime && (
            <Text size='sm' className='text-typography-500 mt-2'>
              <Text size='sm' className='font-semibold'>
                Last Upload:
              </Text>{' '}
              {lastUploadTime.toLocaleTimeString()}
            </Text>
          )}
        </PopoverBody>
        <PopoverFooter className='gap-2'>
          {errorCount > 0 && (
            <Button
              size='sm'
              action='negative'
              onPress={handleRetryFailed}
              isDisabled={isProcessing || !isOnline}
              className='flex-1'
            >
              <ButtonText>Retry Failed</ButtonText>
            </Button>
          )}
          <Button
            size='sm'
            action='primary'
            onPress={handleForceUpload}
            isDisabled={isProcessing || !isOnline || pendingCount === 0}
            className='flex-1'
          >
            <ButtonText>
              {isProcessing ? 'Uploading...' : 'Upload Now'}
            </ButtonText>
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  );
}
