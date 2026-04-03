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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  CheckIcon,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

export interface TeamFilters {
  sortBy: 'rank' | 'median_fuel_scored' | 'median_auto_fuel' | 'median_climb_level' | 'prescout_hopper_size' | 'prescout_driver_years';
  sortOrder: 'asc' | 'desc';
  drivetrain: string | null;
  rangeFilter: string | null;
  turret: boolean | null;
  hood: boolean | null;
  shooterType: string | null;
  trenchTravel: boolean | null;
  trenchPreference: string | null;
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
  { value: 'median_fuel_scored', label: 'Median Fuel Scored' },
  { value: 'median_auto_fuel', label: 'Median Auto Fuel' },
  { value: 'median_climb_level', label: 'Median Climb Level' },
  { value: 'prescout_hopper_size', label: 'Hopper Size' },
  { value: 'prescout_driver_years', label: 'Driver Years' },
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
                <Select
                  selectedValue={local.sortBy}
                  onValueChange={(value) =>
                    setLocal((prev) => ({ ...prev, sortBy: value as TeamFilters['sortBy'] }))
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

              {/* Drivetrain */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>Drivetrain</Text>
                <Select
                  selectedValue={local.drivetrain ?? ''}
                  onValueChange={(value) =>
                    setLocal((prev) => ({ ...prev, drivetrain: value || null }))
                  }
                >
                  <SelectTrigger>
                    <SelectInput placeholder='Any' />
                  </SelectTrigger>
                  <SelectPortal>
                    <SelectBackdrop />
                    <SelectContent>
                      <SelectDragIndicatorWrapper>
                        <SelectDragIndicator />
                      </SelectDragIndicatorWrapper>
                      <SelectItem label='Any' value='' />
                      <SelectItem label='Swerve' value='swerve' />
                      <SelectItem label='Tank' value='tank' />
                      <SelectItem label='Mecanum' value='mecanum' />
                    </SelectContent>
                  </SelectPortal>
                </Select>
              </VStack>

              {/* Range */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>Shooter Range</Text>
                <Select
                  selectedValue={local.rangeFilter ?? ''}
                  onValueChange={(value) =>
                    setLocal((prev) => ({ ...prev, rangeFilter: value || null }))
                  }
                >
                  <SelectTrigger>
                    <SelectInput placeholder='Any' />
                  </SelectTrigger>
                  <SelectPortal>
                    <SelectBackdrop />
                    <SelectContent>
                      <SelectDragIndicatorWrapper>
                        <SelectDragIndicator />
                      </SelectDragIndicatorWrapper>
                      <SelectItem label='Any' value='' />
                      <SelectItem label='Alliance Zone Only' value='alliance' />
                      <SelectItem label='Neutral to Alliance Zone' value='neutral' />
                      <SelectItem label='Opponent to Alliance Zone' value='opponent' />
                      <SelectItem label='N/A' value='none' />
                    </SelectContent>
                  </SelectPortal>
                </Select>
              </VStack>

              {/* Shooter Info */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>Shooter Info</Text>
                <Select
                  selectedValue={local.shooterType ?? ''}
                  onValueChange={(value) =>
                    setLocal((prev) => ({ ...prev, shooterType: value || null }))
                  }
                >
                  <SelectTrigger>
                    <SelectInput placeholder='Any type' />
                  </SelectTrigger>
                  <SelectPortal>
                    <SelectBackdrop />
                    <SelectContent>
                      <SelectDragIndicatorWrapper>
                        <SelectDragIndicator />
                      </SelectDragIndicatorWrapper>
                      <SelectItem label='Any' value='' />
                      <SelectItem label='Single' value='single' />
                      <SelectItem label='Double' value='double' />
                      <SelectItem label='Triple' value='triple' />
                      <SelectItem label='Quad' value='quad' />
                      <SelectItem label='None' value='none' />
                    </SelectContent>
                  </SelectPortal>
                </Select>
                <HStack space='md'>
                  <Checkbox
                    value='turret'
                    isChecked={local.turret === true}
                    onChange={(checked) =>
                      setLocal((prev) => ({ ...prev, turret: checked ? true : null }))
                    }
                  >
                    <CheckboxIndicator>
                      <CheckboxIcon as={CheckIcon} />
                    </CheckboxIndicator>
                    <CheckboxLabel>Turret (Yaw)</CheckboxLabel>
                  </Checkbox>
                  <Checkbox
                    value='hood'
                    isChecked={local.hood === true}
                    onChange={(checked) =>
                      setLocal((prev) => ({ ...prev, hood: checked ? true : null }))
                    }
                  >
                    <CheckboxIndicator>
                      <CheckboxIcon as={CheckIcon} />
                    </CheckboxIndicator>
                    <CheckboxLabel>Hood (Pitch)</CheckboxLabel>
                  </Checkbox>
                </HStack>
              </VStack>

              {/* Trench Travel */}
              <VStack space='sm'>
                <Text className='font-semibold text-typography-700'>Trench Travel</Text>
                <Checkbox
                  value='trenchTravel'
                  isChecked={local.trenchTravel === true}
                  onChange={(checked) =>
                    setLocal((prev) => ({ ...prev, trenchTravel: checked ? true : null }))
                  }
                >
                  <CheckboxIndicator>
                    <CheckboxIcon as={CheckIcon} />
                  </CheckboxIndicator>
                  <CheckboxLabel>Can Travel Through Trench</CheckboxLabel>
                </Checkbox>
                <Select
                  selectedValue={local.trenchPreference ?? ''}
                  onValueChange={(value) =>
                    setLocal((prev) => ({ ...prev, trenchPreference: value || null }))
                  }
                >
                  <SelectTrigger>
                    <SelectInput placeholder='Any preference' />
                  </SelectTrigger>
                  <SelectPortal>
                    <SelectBackdrop />
                    <SelectContent>
                      <SelectDragIndicatorWrapper>
                        <SelectDragIndicator />
                      </SelectDragIndicatorWrapper>
                      <SelectItem label='Any' value='' />
                      <SelectItem label='Trench Only' value='trench' />
                      <SelectItem label='Bump Only' value='bump' />
                      <SelectItem label='Both' value='both' />
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
