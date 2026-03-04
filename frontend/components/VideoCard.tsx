import React from 'react';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { Progress, ProgressFilledTrack } from '@/components/ui/progress';
import {
  Check,
  Play,
  Clock,
  CloudCheck,
  CloudOff,
  Save,
  SaveOff,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { VideoListItem, MatchStatus } from '@/hooks/useVideoManager';

const getStatusConfig = (status: MatchStatus) => {
  switch (status) {
    case 'played':
      return { label: 'Played', action: 'success' as const, icon: Check };
    case 'current':
      return { label: 'Current', action: 'info' as const, icon: Play };
    case 'upcoming':
      return { label: 'Upcoming', action: 'muted' as const, icon: Clock };
  }
};

interface VideoCardProps {
  video: VideoListItem;
  isSelected: boolean;
  onToggleSelect: (matchNumber: number) => void;
  downloadProgress?: number;
  queuePosition?: number;
}

export function VideoCard({
  video,
  isSelected,
  onToggleSelect,
  downloadProgress,
  queuePosition,
}: VideoCardProps) {
  const isDownloading = downloadProgress !== undefined;
  return (
    <Pressable onPress={() => onToggleSelect(video.match_number)}>
      <Card variant='outline' size='md' className='mb-2 p-2'>
        <HStack className='items-center gap-2 justify-between'>
          {/* Select Checkbox - visual only, card handles the click */}
          <View
            className={`w-5 h-5 border-2 rounded justify-center items-center ${
              isSelected
                ? 'bg-primary-600 border-primary-600'
                : 'bg-transparent border-outline-400'
            }`}
          >
            {isSelected && (
              <Icon as={Check} size='sm' className='text-typography-50' />
            )}
          </View>

          <VStack className='flex-1'>
            <HStack className='items-center gap-2'>
              <Text className='text-md text-typography-900 capitalize'>
                {video.match_type} #{video.match_number}
              </Text>
              <Badge
                size='sm'
                variant='solid'
                action={getStatusConfig(video.matchStatus).action}
              >
                <BadgeText>
                  {getStatusConfig(video.matchStatus).label}
                </BadgeText>
              </Badge>
              {queuePosition !== undefined && (
                <Badge size='sm' variant='solid' action='warning'>
                  <BadgeText>#{queuePosition}</BadgeText>
                </Badge>
              )}
            </HStack>
          </VStack>

          <HStack space='sm' className='items-end'>
            <HStack space='xs' className='gap-1 justify-end items-center'>
              <Badge
                size='lg'
                variant='solid'
                action={video.isAvailable ? 'info' : 'error'}
              >
                <BadgeIcon
                  size='lg'
                  className='h-5 w-5'
                  as={video.isAvailable ? CloudCheck : CloudOff}
                />
              </Badge>
            </HStack>
            <HStack space='xs' className='gap-1 items-center'>
              <Badge
                size='lg'
                variant='solid'
                action={video.isDownloaded ? 'success' : 'error'}
              >
                <BadgeIcon
                  size='lg'
                  className='h-5 w-5'
                  as={video.isDownloaded ? Save : SaveOff}
                />
              </Badge>
            </HStack>
          </HStack>
        </HStack>
        {isDownloading && (
          <Progress value={downloadProgress} size='xs' className='p-0 m-0 mt-2'>
            <ProgressFilledTrack className='bg-primary-500' />
          </Progress>
        )}
      </Card>
    </Pressable>
  );
}
