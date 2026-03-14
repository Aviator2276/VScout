import React, { useState, useEffect } from 'react';
import { ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/button';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/ui/modal';
import {
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Video,
  Clock,
  CheckCircle,
  CircleDotDashed,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

export interface MatchFilters {
  timeFilter: 'all' | 'upcoming' | 'played';
  hasVideo: boolean | null;
  sortBy: 'match_number' | 'scouted_count';
  sortOrder: 'asc' | 'desc';
}

interface MatchFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: MatchFilters;
  onApply: (filters: MatchFilters) => void;
  onReset: () => void;
}

const TIME_OPTIONS: {
  value: MatchFilters['timeFilter'];
  label: string;
  icon: typeof Clock;
}[] = [
  { value: 'all', label: 'All Matches', icon: Clock },
  { value: 'upcoming', label: 'Upcoming', icon: Clock },
  { value: 'played', label: 'Played', icon: CheckCircle },
];

const SORT_OPTIONS: { value: MatchFilters['sortBy']; label: string }[] = [
  { value: 'match_number', label: 'Match #' },
  { value: 'scouted_count', label: 'Scouted Count' },
];

export function MatchFilterModal({
  isOpen,
  onClose,
  filters,
  onApply,
  onReset,
}: MatchFilterModalProps) {
  const [local, setLocal] = useState<MatchFilters>(filters);

  useEffect(() => {
    if (isOpen) {
      setLocal(filters);
    }
  }, [isOpen, filters]);

  function toggleSortOrder() {
    setLocal((prev) => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalBackdrop />
      <ModalContent className='max-w-md max-h-[85%]'>
        <ModalHeader>
          <HStack className='items-center justify-between w-full'>
            <Heading size='lg'>Filters & Sort</Heading>
            <Pressable onPress={onReset}>
              <HStack space='xs' className='items-center'>
                <Icon
                  as={RotateCcw}
                  size='xs'
                  className='text-typography-500'
                />
                <Text className='text-sm text-typography-500'>Reset</Text>
              </HStack>
            </Pressable>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <ScrollView showsVerticalScrollIndicator={false}>
            <VStack space='lg'>
              {/* Time Filter */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>
                  Match Status
                </Text>
                <HStack space='xs' className='flex-wrap'>
                  {TIME_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() =>
                        setLocal((prev) => ({ ...prev, timeFilter: opt.value }))
                      }
                    >
                      <Badge
                        size='lg'
                        variant='solid'
                        action={
                          local.timeFilter === opt.value ? 'info' : 'muted'
                        }
                        className='mb-1 items-center'
                      >
                        <BadgeText>{opt.label}</BadgeText>
                      </Badge>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>

              {/* Video Filter */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>Video</Text>
                <HStack space='xs' className='flex-wrap'>
                  <Pressable
                    onPress={() =>
                      setLocal((prev) => ({
                        ...prev,
                        hasVideo: prev.hasVideo === true ? null : true,
                      }))
                    }
                  >
                    <Badge
                      size='lg'
                      variant='solid'
                      action={local.hasVideo === true ? 'info' : 'muted'}
                      className='mb-1 items-center'
                    >
                      <BadgeIcon as={Video} />
                      <BadgeText className='ml-1'>Has Video</BadgeText>
                    </Badge>
                  </Pressable>
                </HStack>
              </VStack>

              {/* Sort By */}
              <VStack space='sm'>
                <HStack className='items-center justify-between'>
                  <Text className='font-semibold text-typography-700'>
                    Sort By
                  </Text>
                  <Pressable onPress={toggleSortOrder}>
                    <Badge
                      size='sm'
                      variant='solid'
                      action='muted'
                      className='items-center'
                    >
                      <BadgeIcon
                        as={local.sortOrder === 'asc' ? ArrowUp : ArrowDown}
                      />
                      <BadgeText className='ml-1 capitalize'>
                        {local.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                      </BadgeText>
                    </Badge>
                  </Pressable>
                </HStack>
                <HStack space='xs' className='flex-wrap'>
                  {SORT_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() =>
                        setLocal((prev) => ({ ...prev, sortBy: opt.value }))
                      }
                    >
                      <Badge
                        size='lg'
                        variant='solid'
                        action={local.sortBy === opt.value ? 'info' : 'muted'}
                        className='mb-1'
                      >
                        <BadgeText>{opt.label}</BadgeText>
                      </Badge>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>
            </VStack>
          </ScrollView>
        </ModalBody>
        <ModalFooter>
          <HStack space='sm' className='w-full'>
            <Button
              size='lg'
              variant='outline'
              action='secondary'
              onPress={onClose}
              className='flex-1'
            >
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button
              size='lg'
              action='positive'
              onPress={() => onApply(local)}
              className='flex-1'
            >
              <ButtonText>Apply</ButtonText>
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
