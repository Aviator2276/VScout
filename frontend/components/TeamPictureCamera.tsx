import React, { useRef, useState, useEffect } from 'react';
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Start camera when actionsheet opens
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      setPermissionDenied(false);
      setCameraReady(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
      } else {
        setCameraError(error.message || 'Failed to access camera');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  const handleClose = () => {
    stopCamera();
    setCameraError(null);
    setPermissionDenied(false);
    onClose();
  };

  const takePicture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Convert to data URL
    const photoUri = canvas.toDataURL('image/jpeg', 0.9);

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

  return (
    <Actionsheet isOpen={isOpen} onClose={handleClose}>
      <ActionsheetBackdrop />
      <ActionsheetContent className='w-full max-h-[90%]'>
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>
        {permissionDenied ? (
          <Center className='flex-1 max-w-2xl self-center w-full p-4'>
            <VStack space='md'>
              <Text className='text-center'>Camera permission was denied. Please allow camera access in your browser settings.</Text>
              <Button onPress={startCamera}>
                <ButtonText>Try Again</ButtonText>
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
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                maxHeight: 500,
                marginTop: 8,
                borderRadius: 10,
                opacity: cameraReady ? 1 : 0,
                objectFit: 'cover',
              }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
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
