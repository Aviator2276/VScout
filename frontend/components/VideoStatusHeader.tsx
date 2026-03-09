import React from 'react';
import { Pressable } from 'react-native';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import {
  Popover,
  PopoverArrow,
  PopoverBackdrop,
  PopoverBody,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Wifi,
  WifiLow,
  WifiOff,
  CirclePause,
  Bolt,
  CirclePlay,
  ListChecks,
  LayoutList,
  ListX,
  ListPlus,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { NetworkQuality } from '@/hooks/useNetworkQuality';
import { VideoDynamicDownloading } from '@/types/video';

interface VideoStatusHeaderProps {
  networkQuality: NetworkQuality;
  isDownloading: boolean;
  isPaused: boolean;
  videoDynamicDownloading: VideoDynamicDownloading;
  isAllSelected: boolean;
  onStartDownloads: () => void;
  onPauseDownloads: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

const QUALITY_CONFIG: Record<
  NetworkQuality,
  { action: 'success' | 'warning' | 'error'; icon: typeof Wifi; label: string }
> = {
  good: { action: 'success', icon: Wifi, label: 'Good' },
  poor: { action: 'warning', icon: WifiLow, label: 'Poor' },
  bad: { action: 'error', icon: WifiOff, label: 'Bad' },
};

export function VideoStatusHeader({
  networkQuality,
  isDownloading,
  isPaused,
  videoDynamicDownloading,
  isAllSelected,
  onStartDownloads,
  onPauseDownloads,
  onSelectAll,
  onDeselectAll,
}: VideoStatusHeaderProps) {
  const router = useRouter();
  const qualityConfig = QUALITY_CONFIG[networkQuality];
  const isAlwaysDownload = videoDynamicDownloading === 'always';

  return (
    <HStack className='items-center justify-between px-4 py-3 border-l border-r border-b rounded-b border-outline-100'>
      {/* Network Quality Badge */}
      <HStack space='sm' className='items-center'>
        <Button
          size='sm'
          variant='solid'
          action='secondary'
          className='px-2'
          onPress={isAllSelected ? onDeselectAll : onSelectAll}
        >
          <ButtonIcon as={isAllSelected ? ListX : ListChecks} size='md' />
        </Button>
        <Badge size='lg' variant='solid' action={qualityConfig.action}>
          <BadgeIcon as={qualityConfig.icon} className='my-[0.1rem]' />
          <BadgeText className='ml-1'>{qualityConfig.label}</BadgeText>
        </Badge>
      </HStack>

      <HStack space='sm' className='items-center'>
        <Button
          size='sm'
          variant='solid'
          action='secondary'
          onPress={() => router.push('/settings?scrollTo=video-config')}
        >
          <Icon as={Bolt} size='md' />
        </Button>
        {isAlwaysDownload ? (
          <Popover
            placement='bottom'
            size='xs'
            trigger={(triggerProps) => (
              <Pressable {...triggerProps}>
                <Button
                  size='sm'
                  variant='solid'
                  action='primary'
                  disabled
                  className='opacity-40'
                  pointerEvents='none'
                >
                  <Icon
                    as={CirclePlay}
                    size='md'
                    className='mr-1 text-typography-0'
                  />
                  <ButtonText>Start</ButtonText>
                </Button>
              </Pressable>
            )}
          >
            <PopoverBackdrop />
            <PopoverContent>
              <PopoverArrow />
              <PopoverBody>
                <Text className='text-typography-900'>
                  Downloads run automatically in &quot;Always&quot; mode.
                </Text>
              </PopoverBody>
            </PopoverContent>
          </Popover>
        ) : (
          <Button
            size='sm'
            variant={isPaused ? 'solid' : 'outline'}
            action={isPaused ? 'primary' : 'secondary'}
            onPress={isPaused ? onStartDownloads : onPauseDownloads}
          >
            <Icon
              as={isPaused ? CirclePlay : CirclePause}
              size='md'
              className={`mr-1 ${isPaused ? 'text-typography-0' : 'text-typography-700'}`}
            />
            <ButtonText>
              {isDownloading && !isPaused ? 'Pause' : 'Start'}
            </ButtonText>
          </Button>
        )}
      </HStack>
    </HStack>
  );
}
