import React, { useState, useEffect } from 'react';
import { Pressable } from 'react-native';
import { Badge, BadgeIcon } from '@/components/ui/badge';
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
  CloudDownload,
  CloudCheck,
  CloudBackup,
  CloudAlert,
} from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';

interface DataStatusProps {
  size?: 'sm' | 'md' | 'lg';
}

type DataFreshnessStatus = 'current' | 'aging' | 'stale';

const STATUS_CONFIG: Record<
  DataFreshnessStatus,
  {
    action: 'success' | 'warning' | 'error';
    icon: LucideIcon;
    label: string;
    description: string;
  }
> = {
  current: {
    action: 'success',
    icon: CloudCheck,
    label: 'Current',
    description: 'Data was recently synchronized.',
  },
  aging: {
    action: 'warning',
    icon: CloudBackup,
    label: 'Aging',
    description: 'Data may be outdated.',
  },
  stale: {
    action: 'error',
    icon: CloudAlert,
    label: 'Stale',
    description: 'Data is stale.',
  },
};

function formatTimeSince(date: Date | null, currentTime: Date): string {
  if (!date) return 'Never';

  const diffMs = currentTime.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else {
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
}

export function DataStatus({ size = 'lg' }: DataStatusProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const {
    lastDataUpdate,
    dataFreshnessStatus,
    forceDataRefresh,
    isRefreshingData,
    dataRefreshInterval,
  } = useApp();

  const config = STATUS_CONFIG[dataFreshnessStatus];

  // Update current time when popover opens and every 10 seconds while open
  useEffect(() => {
    if (isOpen) {
      setCurrentTime(new Date());
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleRefresh = async () => {
    await forceDataRefresh();
  };

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
            action={isRefreshingData ? 'muted' : config.action}
          >
            {isRefreshingData ? (
              <BadgeIcon
                as={CloudDownload}
                className='my-[0.1rem] animate-pulse'
              />
            ) : (
              <BadgeIcon as={config.icon} className='my-[0.1rem]' />
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
              Last Update:
            </Text>{' '}
            {formatTimeSince(lastDataUpdate, currentTime)}
          </Text>
          <Text size='sm' className='text-typography-500'>
            <Text size='sm' className='font-semibold'>
              Refresh Interval:
            </Text>{' '}
            {dataRefreshInterval} minute{dataRefreshInterval !== 1 ? 's' : ''}
          </Text>
        </PopoverBody>
        <PopoverFooter>
          <Button
            size='sm'
            action='primary'
            onPress={handleRefresh}
            isDisabled={isRefreshingData}
            className='w-full'
          >
            <ButtonText>
              {isRefreshingData ? 'Refreshing...' : 'Refresh Now'}
            </ButtonText>
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  );
}
