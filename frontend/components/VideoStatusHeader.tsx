import React from 'react';
import { Pressable } from 'react-native';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import {
  Settings,
  Play,
  Pause,
  Wifi,
  WifiLow,
  WifiOff,
  CirclePause,
  Download,
  Bolt,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { NetworkQuality } from '@/hooks/useNetworkQuality';
import { VideoDynamicDownloading } from '@/types/video';

interface VideoStatusHeaderProps {
  networkQuality: NetworkQuality;
  isDownloading: boolean;
  isPaused: boolean;
  videoDynamicDownloading: VideoDynamicDownloading;
  onStartDownloads: () => void;
  onPauseDownloads: () => void;
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
  onStartDownloads,
  onPauseDownloads,
}: VideoStatusHeaderProps) {
  const router = useRouter();
  const qualityConfig = QUALITY_CONFIG[networkQuality];
  const isAlwaysDownload = videoDynamicDownloading === 'always';

  return (
    <HStack className='items-center justify-between px-4 py-2 border-l border-r border-b rounded-b border-outline-100'>
      {/* Network Quality Badge */}
      <Badge size='lg' variant='solid' action={qualityConfig.action}>
        <BadgeIcon as={qualityConfig.icon} className='my-[0.1rem]' />
        <BadgeText className='ml-1'>{qualityConfig.label}</BadgeText>
      </Badge>

      <HStack space='sm' className='items-center'>
        <Button
          size='sm'
          variant='solid'
          action='secondary'
          onPress={() => router.push('/settings?scrollTo=video-config')}
          className=''
        >
          <Icon as={Bolt} size='md' className={``} />
        </Button>
        <Button
          size='sm'
          variant={isPaused ? 'solid' : 'outline'}
          action={isPaused ? 'primary' : 'secondary'}
          onPress={isPaused ? onStartDownloads : onPauseDownloads}
          disabled={isAlwaysDownload}
          className={isAlwaysDownload ? 'opacity-40' : ''}
        >
          <Icon
            as={isPaused ? Download : CirclePause}
            size='md'
            className={`mr-1 ${isPaused ? 'text-typography-0' : 'text-typography-700'}`}
          />
          <ButtonText>
            {isDownloading && !isPaused ? 'Pause' : 'Start'}
          </ButtonText>
        </Button>
      </HStack>
    </HStack>
  );
}
