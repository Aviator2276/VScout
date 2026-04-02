import React, { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleClose = () => {
    setCameraReady(false);
    onClose();
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;

    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
    if (!photo) return;

    const photoUri = photo.uri;

    const now = Date.now();
    const pictureRecord: PictureRecord = {
      info: {
        status: 'pending',
        competitionCode,
        created_at: now,
        last_retry: now,
      },
      team: {
        number: teamNumber,
        name: teamName,
        competitionCode,
      },
      picture: photoUri,
    };

    await db.pictureRecords.put(pictureRecord);
    onCapture(photoUri);
    handleClose();
  };

  const renderCameraContent = () => {
    if (!permission) {
      // Permissions still loading
      return (
        <Center className='flex-1 max-w-2xl self-center w-full p-4'>
          <Spinner size='large' />
        </Center>
      );
    }

    if (!permission.granted) {
      return (
        <Center className='flex-1 max-w-2xl self-center w-full p-4'>
          <VStack space='md'>
            <Text className='text-center'>Camera permission is required to take team pictures.</Text>
            <Button onPress={requestPermission}>
              <ButtonText>Grant Permission</ButtonText>
            </Button>
          </VStack>
        </Center>
      );
    }

    return (
      <>
        {!cameraReady && (
          <Center className='absolute inset-0 z-10'>
            <Spinner size='large' />
          </Center>
        )}
        <CameraView
          ref={cameraRef}
          facing='back'
          style={{
            width: '100%',
            height: 500,
            marginTop: 8,
            borderRadius: 10,
            overflow: 'hidden',
            opacity: cameraReady ? 1 : 0,
          }}
          onCameraReady={() => setCameraReady(true)}
          onMountError={(e) => console.error('Camera mount error:', e.message)}
        />
      </>
    );
  };

  return (
    <Actionsheet isOpen={isOpen} onClose={handleClose}>
      <ActionsheetBackdrop />
      <ActionsheetContent className='w-full max-h-[90%]'>
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>
        {renderCameraContent()}
        <Button
          size='lg'
          action='primary'
          onPress={takePicture}
          className='w-full mb-4 mt-4'
          isDisabled={!cameraReady}
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
