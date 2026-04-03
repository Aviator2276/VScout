import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
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
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Native refs
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // Web refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start the web camera stream when the sheet opens
  useEffect(() => {
    if (Platform.OS !== 'web' || !isOpen) return;

    let cancelled = false;

    async function startStream() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (err: any) {
        if (!cancelled) {
          console.error('Camera error:', err);
          setCameraError(err.message || 'Failed to access camera');
        }
      }
    }

    startStream();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setCameraReady(false);
    setCameraError(null);
    if (Platform.OS === 'web' && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    onClose();
  }, [onClose]);

  const savePicture = useCallback(
    async (photoUri: string) => {
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
    },
    [competitionCode, teamNumber, teamName, onCapture, handleClose],
  );

  const takePictureWeb = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUri = canvas.toDataURL('image/jpeg', 0.9);
    await savePicture(dataUri);
  }, [savePicture]);

  const takePictureNative = useCallback(async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
    if (!photo) return;
    await savePicture(photo.uri);
  }, [savePicture]);

  const renderCameraContent = () => {
    if (cameraError) {
      return (
        <Center className='flex-1 max-w-2xl self-center w-full p-4'>
          <VStack space='md'>
            <Text className='text-error-500 text-center'>{cameraError}</Text>
            <Button onPress={() => { setCameraError(null); }}>
              <ButtonText>Try Again</ButtonText>
            </Button>
          </VStack>
        </Center>
      );
    }

    if (Platform.OS === 'web') {
      return (
        <>
          {!cameraReady && (
            <Center style={{ height: 500 }}>
              <Spinner size='large' />
            </Center>
          )}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: cameraReady ? 500 : 0,
              marginTop: 8,
              borderRadius: 10,
              objectFit: 'cover',
            }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </>
      );
    }

    // Native path
    if (!permission) {
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
          onMountError={(e) => {
            console.error('Camera mount error:', e.message);
            setCameraError(e.message || 'Failed to access camera');
          }}
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
          onPress={Platform.OS === 'web' ? takePictureWeb : takePictureNative}
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
