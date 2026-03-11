import React, { useRef, useEffect } from 'react';
import { useWindowDimensions, Platform, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Play, RotateCcw } from 'lucide-react-native';
import { Badge, BadgeText } from '@/components/ui/badge';
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
  teamAlliance?: 'blue' | 'red' | null;
  playbackSpeed: number;
  isLive: boolean;
  onStart: () => void;
  alignRight?: boolean;
  videoUrl?: string | null;
}

export function ScoutingStartOverlay({
  matchType,
  matchNumber,
  teamNumber,
  teamAlliance,
  playbackSpeed,
  isLive,
  onStart,
  alignRight,
  videoUrl,
}: ScoutingStartOverlayProps) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isPortrait = height > width;
  const isMobile = Platform.OS !== 'web' || width < 768;
  // Video scouting on mobile always requires landscape orientation
  const needsRotation = isMobile && isPortrait && !isLive;
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (needsRotation) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    }
  }, [needsRotation, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });

  function handleCancel() {
    router.back();
  }

  // Portrait mode: show rotate phone screen (only for video scouting on mobile)
  if (needsRotation) {
    return (
      <Modal isOpen={true} onClose={handleCancel} closeOnOverlayClick={false}>
        <ModalBackdrop />
        <ModalContent className='max-w-sm'>
          <ModalBody>
            <VStack space='lg' className='items-center py-6'>
              <Animated.View
                style={{
                  transform: [{ rotate: spin }],
                }}
              >
                <Icon
                  as={RotateCcw}
                  size='xl'
                  className='text-primary-500'
                  style={{ width: 64, height: 64 }}
                />
              </Animated.View>
              <Heading size='lg' className='text-center'>
                Rotate Your Device
              </Heading>
              <Text className='text-typography-500 text-center'>
                Please rotate your phone to landscape mode to start scouting.
              </Text>
              <Text className='text-warning-500 text-sm text-center'>
                If the screen doesn&apos;t rotate, make sure orientation lock is
                turned off.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter>
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

  // Landscape / desktop mode with video preview
  if (!isLive && videoUrl) {
    return (
      <Modal isOpen={true} onClose={handleCancel} closeOnOverlayClick={false}>
        <ModalBackdrop />
        <ModalContent className='max-w-4xl'>
          <ModalHeader>
            <Heading size='xl' className='text-center capitalize w-full'>
              {matchType} {matchNumber}
            </Heading>
          </ModalHeader>
          <ModalBody>
            <HStack space='lg' className='items-stretch'>
              {/* Video preview */}
              <Box className='flex-[2] rounded-lg overflow-hidden bg-background-950'>
                {Platform.OS === 'web' ? (
                  <video
                    ref={previewVideoRef}
                    src={videoUrl}
                    playsInline
                    muted
                    preload='auto'
                    controls
                    onLoadedMetadata={() => {
                      if (previewVideoRef.current) {
                        previewVideoRef.current.currentTime = 0;
                      }
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: 8,
                      touchAction: 'manipulation',
                    }}
                  />
                ) : (
                  <Box className='flex-1 items-center justify-center'>
                    <Text className='text-typography-400'>Video Preview</Text>
                  </Box>
                )}
              </Box>

              {/* Match info */}
              <VStack space='md' className='w-48 justify-center items-center'>
                <HStack className='items-center justify-center gap-2'>
                  <Text className='text-typography-600 text-center'>
                    Scouting Team
                  </Text>
                  <Badge
                    size='lg'
                    variant='solid'
                    className={
                      teamAlliance === 'blue'
                        ? 'bg-blue-500'
                        : teamAlliance === 'red'
                          ? 'bg-red-500'
                          : 'bg-typography-500'
                    }
                  >
                    <BadgeText className='text-white font-semibold'>
                      {teamNumber}
                    </BadgeText>
                  </Badge>
                </HStack>
                <Text className='text-typography-500 text-sm text-center'>
                  Playback Speed: {playbackSpeed}x
                </Text>
                <Text className='text-typography-400 text-xs text-center'>
                  Scrub the video to find your robot before starting
                </Text>
                <Button
                  size='lg'
                  action='positive'
                  onPress={onStart}
                  className='w-full'
                >
                  <ButtonText>Start</ButtonText>
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
              </VStack>
            </HStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    );
  }

  // Default: live scouting or no video (original layout)
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
            <HStack className='items-center justify-center gap-2'>
              <Text className='text-typography-600 text-center'>
                Scouting Team
              </Text>
              <Badge
                size='lg'
                variant='solid'
                className={
                  teamAlliance === 'blue'
                    ? 'bg-blue-500'
                    : teamAlliance === 'red'
                      ? 'bg-red-500'
                      : 'bg-typography-500'
                }
              >
                <BadgeText className='text-white font-semibold'>
                  {teamNumber}
                </BadgeText>
              </Badge>
            </HStack>
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
            <ButtonText>Start</ButtonText>
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
