import React from 'react';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { Check, Download, X, Play, Clock, Calendar } from 'lucide-react-native';
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
}

export function VideoCard({
  video,
  isSelected,
  onToggleSelect,
}: VideoCardProps) {
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
            </HStack>
          </VStack>

          <VStack space='xs' className='items-end'>
            <HStack space='xs' className='gap-1 justify-end items-center'>
              <Text className='text-xs text-typography-500'>Available:</Text>
              <Badge
                size='sm'
                variant='solid'
                action={video.isAvailable ? 'success' : 'error'}
              >
                <BadgeIcon as={video.isAvailable ? Check : X} />
              </Badge>
            </HStack>
            <HStack space='xs' className='gap-1 items-center'>
              <Text className='text-xs text-typography-500'>Cached:</Text>
              <Badge
                size='sm'
                variant='solid'
                action={video.isDownloaded ? 'info' : 'error'}
              >
                <BadgeIcon as={video.isDownloaded ? Check : X} />
              </Badge>
            </HStack>
          </VStack>
        </HStack>
      </Card>
    </Pressable>
  );
}
