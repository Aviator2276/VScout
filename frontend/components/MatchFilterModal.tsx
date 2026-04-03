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
  Select,
  SelectTrigger,
  SelectInput,
  SelectPortal,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicatorWrapper,
  SelectDragIndicator,
  SelectItem,
} from '@/components/ui/select';
import {
  Checkbox,
  CheckboxIndicator,
  CheckboxIcon,
  CheckboxLabel,
} from '@/components/ui/checkbox';
import {
  ArrowUp,
  ArrowDown,
  RotateCcw,
  CheckIcon,
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
              {/* Match Status */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>
                  Match Status
                </Text>
                <Select
                  selectedValue={local.timeFilter}
                  onValueChange={(value) =>
                    setLocal((prev) => ({
                      ...prev,
                      timeFilter: value as MatchFilters['timeFilter'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectInput placeholder='All Matches' />
                  </SelectTrigger>
                  <SelectPortal>
                    <SelectBackdrop />
                    <SelectContent>
                      <SelectDragIndicatorWrapper>
                        <SelectDragIndicator />
                      </SelectDragIndicatorWrapper>
                      <SelectItem label='All Matches' value='all' />
                      <SelectItem label='Upcoming' value='upcoming' />
                      <SelectItem label='Played' value='played' />
                    </SelectContent>
                  </SelectPortal>
                </Select>
              </VStack>

              {/* Video Filter */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>Video</Text>
                <Checkbox
                  value='hasVideo'
                  isChecked={local.hasVideo === true}
                  onChange={(checked) =>
                    setLocal((prev) => ({
                      ...prev,
                      hasVideo: checked ? true : null,
                    }))
                  }
                >
                  <CheckboxIndicator>
                    <CheckboxIcon as={CheckIcon} />
                  </CheckboxIndicator>
                  <CheckboxLabel>Has Video</CheckboxLabel>
                </Checkbox>
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
                <Select
                  selectedValue={local.sortBy}
                  onValueChange={(value) =>
                    setLocal((prev) => ({
                      ...prev,
                      sortBy: value as MatchFilters['sortBy'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectInput
                      placeholder='Select sort'
                      value={SORT_OPTIONS.find((o) => o.value === local.sortBy)?.label}
                    />
                  </SelectTrigger>
                  <SelectPortal>
                    <SelectBackdrop />
                    <SelectContent>
                      <SelectDragIndicatorWrapper>
                        <SelectDragIndicator />
                      </SelectDragIndicatorWrapper>
                      {SORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} label={opt.label} value={opt.value} />
                      ))}
                    </SelectContent>
                  </SelectPortal>
                </Select>
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
