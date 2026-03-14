import React, { useState, useEffect } from 'react';
import { ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Dice4,
  Move,
  MoveVertical,
  CircleQuestionMark,
  RotateCcw,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

export interface TeamFilters {
  sortBy: 'rank' | 'avg_fuel_scored' | 'avg_climb_points' | 'prescout_hopper_size' | 'prescout_driver_years';
  sortOrder: 'asc' | 'desc';
  drivetrain: string | null;
  rangeFilter: string | null;
  turret: boolean | null;
  hood: boolean | null;
}

interface TeamFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: TeamFilters;
  onApply: (filters: TeamFilters) => void;
  onReset: () => void;
}

const SORT_OPTIONS: { value: TeamFilters['sortBy']; label: string }[] = [
  { value: 'rank', label: 'Rank' },
  { value: 'avg_fuel_scored', label: 'Avg Fuel Scored' },
  { value: 'avg_climb_points', label: 'Avg Climb Level' },
  { value: 'prescout_hopper_size', label: 'Hopper Size' },
  { value: 'prescout_driver_years', label: 'Driver Years' },
];

const DRIVETRAIN_OPTIONS = [
  { value: 'swerve', label: 'Swerve', icon: Dice4 },
  { value: 'mecanum', label: 'Mecanum', icon: Move },
  { value: 'tank', label: 'Tank', icon: MoveVertical },
];

const RANGE_OPTIONS = [
  { value: 'alliance zone', label: 'Alliance Zone' },
  { value: 'neutral zone', label: 'Neutral Zone' },
  { value: 'opponent zone', label: 'Opponent Zone' },
];

export function TeamFilterModal({
  isOpen,
  onClose,
  filters,
  onApply,
  onReset,
}: TeamFilterModalProps) {
  const [local, setLocal] = useState<TeamFilters>(filters);

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
            <Pressable
              onPress={() => {
                onReset();
              }}
            >
              <HStack space='xs' className='items-center'>
                <Icon as={RotateCcw} size='xs' className='text-typography-500' />
                <Text className='text-sm text-typography-500'>Reset</Text>
              </HStack>
            </Pressable>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <ScrollView showsVerticalScrollIndicator={false}>
            <VStack space='lg'>
              {/* Sort By */}
              <VStack space='sm'>
                <HStack className='items-center justify-between'>
                  <Text className='font-semibold text-typography-700'>Sort By</Text>
                  <Pressable onPress={toggleSortOrder}>
                    <Badge size='sm' variant='solid' action='muted' className='items-center'>
                      <BadgeIcon as={local.sortOrder === 'asc' ? ArrowUp : ArrowDown} />
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
                      onPress={() => setLocal((prev) => ({ ...prev, sortBy: opt.value }))}
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

              {/* Drivetrain */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>Drivetrain</Text>
                <HStack space='xs' className='flex-wrap'>
                  {DRIVETRAIN_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() =>
                        setLocal((prev) => ({
                          ...prev,
                          drivetrain: prev.drivetrain === opt.value ? null : opt.value,
                        }))
                      }
                    >
                      <Badge
                        size='lg'
                        variant='solid'
                        action={local.drivetrain === opt.value ? 'info' : 'muted'}
                        className='mb-1 items-center'
                      >
                        <BadgeIcon as={opt.icon} />
                        <BadgeText className='ml-1'>{opt.label}</BadgeText>
                      </Badge>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>

              {/* Range */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>Range</Text>
                <HStack space='xs' className='flex-wrap'>
                  {RANGE_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() =>
                        setLocal((prev) => ({
                          ...prev,
                          rangeFilter: prev.rangeFilter === opt.value ? null : opt.value,
                        }))
                      }
                    >
                      <Badge
                        size='lg'
                        variant='solid'
                        action={local.rangeFilter === opt.value ? 'info' : 'muted'}
                        className='mb-1'
                      >
                        <BadgeText>{opt.label}</BadgeText>
                      </Badge>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>

              {/* Shooter Rotation */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>Shooter Rotation</Text>
                <HStack space='sm'>
                  <Pressable
                    onPress={() =>
                      setLocal((prev) => ({
                        ...prev,
                        turret: prev.turret === true ? null : true,
                      }))
                    }
                  >
                    <Badge
                      size='lg'
                      variant='solid'
                      action={local.turret === true ? 'info' : 'muted'}
                    >
                      <BadgeText>Turret (Yaw)</BadgeText>
                    </Badge>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setLocal((prev) => ({
                        ...prev,
                        hood: prev.hood === true ? null : true,
                      }))
                    }
                  >
                    <Badge
                      size='lg'
                      variant='solid'
                      action={local.hood === true ? 'info' : 'muted'}
                    >
                      <BadgeText>Hood (Pitch)</BadgeText>
                    </Badge>
                  </Pressable>
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
