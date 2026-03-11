import React from 'react';
import { HStack } from '@/components/ui/hstack';
import { Button, ButtonText } from '@/components/ui/button';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import {
  Wifi,
  WifiLow,
  WifiOff,
  Bolt,
  CircleX,
  Check,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { NetworkQuality } from '@/hooks/useNetworkQuality';
import { Checkbox, CheckboxIcon, CheckboxIndicator } from './ui/checkbox';

interface VideoStatusHeaderProps {
  networkQuality: NetworkQuality;
  isDownloading: boolean;
  isAllSelected: boolean;
  onCancelDownloads: () => void;
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
  isAllSelected,
  onCancelDownloads,
  onSelectAll,
  onDeselectAll,
}: VideoStatusHeaderProps) {
  const router = useRouter();
  const qualityConfig = QUALITY_CONFIG[networkQuality];

  return (
    <HStack className='items-center justify-between px-4 py-3 border-l border-r border-b rounded-b border-outline-100'>
      {/* Network Quality Badge */}
      <HStack space='sm' className='items-center'>
        <Checkbox
          value='mute'
          isChecked={isAllSelected}
          onChange={isAllSelected ? onDeselectAll : onSelectAll}
          size='lg'
          className='ml-1'
        >
          <CheckboxIndicator>
            <CheckboxIcon as={Check} />
          </CheckboxIndicator>
        </Checkbox>
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
        {isDownloading && (
          <Button
            size='sm'
            variant='solid'
            action='negative'
            onPress={onCancelDownloads}
          >
            <Icon
              as={CircleX}
              size='md'
              className='mr-1 text-typography-0'
            />
            <ButtonText>Cancel</ButtonText>
          </Button>
        )}
      </HStack>
    </HStack>
  );
}
