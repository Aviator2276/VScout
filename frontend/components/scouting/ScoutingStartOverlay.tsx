import React from 'react';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Play } from 'lucide-react-native';
import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/ui/modal';

interface ScoutingStartOverlayProps {
  matchType: string;
  matchNumber: number;
  teamNumber: number;
  playbackSpeed: number;
  isLive: boolean;
  onStart: () => void;
  alignRight?: boolean;
}

export function ScoutingStartOverlay({
  matchType,
  matchNumber,
  teamNumber,
  playbackSpeed,
  isLive,
  onStart,
  alignRight,
}: ScoutingStartOverlayProps) {
  const router = useRouter();

  function handleCancel() {
    router.back();
  }

  return (
    <Modal
      isOpen={true}
      onClose={handleCancel}
      closeOnOverlayClick={false}
      className={alignRight ? 'justify-center items-end pr-4' : undefined}
    >
      <ModalBackdrop />
      <ModalContent className='max-w-sm'>
        <ModalHeader>
          <Heading size='xl' className='text-center capitalize w-full'>
            {matchType} {matchNumber}
          </Heading>
        </ModalHeader>
        <ModalBody>
          <VStack space='md' className='items-center'>
            <Text className='text-typography-600 text-center'>
              Scouting Team {teamNumber}
            </Text>
            {!isLive && (
              <Text className='text-typography-500 text-sm text-center'>
                Playback Speed: {playbackSpeed}x
              </Text>
            )}
            <Text className='text-warning-500 text-sm text-center'>
              Timer will start immediately when you press Start
            </Text>
          </VStack>
        </ModalBody>
        <ModalFooter className='flex-col gap-2'>
          <Button
            size='lg'
            action='positive'
            onPress={onStart}
            className='w-full'
          >
            <Icon as={Play} size='md' className='mr-2 text-typography-0' />
            <ButtonText>Start Scouting</ButtonText>
          </Button>
          <Button
            size='lg'
            variant='outline'
            action='secondary'
            onPress={handleCancel}
            className='w-full'
          >
            <ButtonText>Cancel</ButtonText>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
