import React from 'react';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { Box } from '@/components/ui/box';
import { Download, Trash2 } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

interface VideoSelectionBarProps {
  selectedCount: number;
  onDownload: () => void;
  onDelete: () => void;
}

export function VideoSelectionBar({
  selectedCount,
  onDownload,
  onDelete,
}: VideoSelectionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <Box className='border-t border-outline-100 bg-background-50 px-4 py-3'>
      <HStack className='items-center justify-between max-w-2xl self-center w-full'>
        <Text className='font-semibold text-typography-700'>
          {selectedCount} selected
        </Text>
        <HStack space='sm'>
          <Button size='sm' action='primary' onPress={onDownload}>
            <Icon as={Download} size='sm' className='text-typography-0' />
            <ButtonText>Download</ButtonText>
          </Button>
          <Button
            size='sm'
            action='negative'
            variant='solid'
            onPress={onDelete}
          >
            <Icon as={Trash2} size='sm' className='text-typography-0' />
            <ButtonText>Delete</ButtonText>
          </Button>
        </HStack>
      </HStack>
    </Box>
  );
}
