import React, { useRef, useState } from 'react';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { Center } from '@/components/ui/center';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from '@/components/ui/actionsheet';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Spinner } from '@/components/ui/spinner';
import { Camera } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { db } from '@/utils/db';
import { PictureRecord } from '@/types/record';

interface TeamPictureCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (uri: string) => void;
  teamNumber: number;
  teamName: string;
  competitionCode: string;
}

export function TeamPictureCamera({
  isOpen,
  onClose,
  onCapture,
  teamNumber,
  teamName,
  competitionCode,
}: TeamPictureCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleClose = () => {
    setCameraReady(false);
    setCameraError(null);
    onClose();
  };

  const takePicture = async () => {
    const photo = await ref.current?.takePictureAsync();
    if (photo?.uri) {
      const now = Date.now();
      const pictureRecord: PictureRecord = {
        info: {
          status: 'pending',
          competitionCode,
          created_at: now,
          last_retry: now,
          archived: false,
        },
        team: {
          number: teamNumber,
          name: teamName,
          competitionCode,
        },
        picture: photo.uri,
      };

      await db.pictureRecords.put(pictureRecord);
      onCapture(photo.uri);
    }
    handleClose();
  };

  return (
    <Actionsheet isOpen={isOpen} onClose={handleClose}>
      <ActionsheetBackdrop />
      <ActionsheetContent className='w-full h-[calc(100%-4rem)]'>
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>
        {!permission?.granted ? (
          <Center className='flex-1 max-w-2xl self-center w-full p-4'>
            <VStack space='md'>
              <Text>We need your permission to take pictures.</Text>
              <Button onPress={requestPermission}>
                <ButtonText>Grant Permission</ButtonText>
              </Button>
            </VStack>
          </Center>
        ) : cameraError ? (
          <Center className='flex-1 max-w-2xl self-center w-full p-4'>
            <VStack space='md'>
              <Text className='text-error-500 text-center'>{cameraError}</Text>
              <Button onPress={handleClose}>
                <ButtonText>Close</ButtonText>
              </Button>
            </VStack>
          </Center>
        ) : (
          <>
            {!cameraReady && (
              <Center className='absolute inset-0 z-10'>
                <Spinner size='large' />
              </Center>
            )}
            <CameraView
              ref={ref}
              style={{
                width: '100%',
                height: 1000,
                marginTop: 8,
                borderRadius: 10,
                opacity: cameraReady ? 1 : 0,
              }}
              facing={'back'}
              mirror={false}
              onCameraReady={() => setCameraReady(true)}
              onMountError={(error) => setCameraError(error.message)}
            />
          </>
        )}
        <Button
          size='lg'
          action='primary'
          onPress={takePicture}
          className='w-full mb-4 mt-4'
        >
          <Icon as={Camera} className='color-slate-100 dark:color-slate-900' />
        </Button>

        <Button
          size='lg'
          action='negative'
          className='w-full mb-4'
          onPress={handleClose}
        >
          <ButtonText>Cancel</ButtonText>
        </Button>
      </ActionsheetContent>
    </Actionsheet>
  );
}
