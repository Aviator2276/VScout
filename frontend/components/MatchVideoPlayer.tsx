import React, {
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { ActivityIndicator } from 'react-native';
import { Card } from '@/components/ui/card';
import { Center } from '@/components/ui/center';
import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Progress, ProgressFilledTrack } from '@/components/ui/progress';
import { Download, VideoOff } from 'lucide-react-native';
import { getVideoUrl, revokeVideoUrl } from '@/utils/videoStorage';
import { useVideoDownload } from '@/contexts/VideoDownloadContext';

interface MatchVideoPlayerProps {
  competitionCode: string;
  matchNumber: number;
  isAvailable: boolean;
  isDownloaded: boolean;
  onDownloadComplete?: () => void;
}

export interface MatchVideoPlayerRef {
  pause: () => void;
}

export const MatchVideoPlayer = forwardRef(function MatchVideoPlayer(
  {
    competitionCode,
    matchNumber,
    isAvailable,
    isDownloaded,
    onDownloadComplete,
  }: MatchVideoPlayerProps,
  ref: React.ForwardedRef<MatchVideoPlayerRef>,
) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { startDownload, downloadProgress, activeDownloads } =
    useVideoDownload();
  const isDownloading = activeDownloads.has(matchNumber);
  const progress = downloadProgress.get(matchNumber) ?? 0;

  useImperativeHandle(ref, () => ({
    pause: () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    },
  }));

  useEffect(() => {
    // Pause video when match changes
    if (videoRef.current) {
      videoRef.current.pause();
    }

    if (isDownloaded) {
      loadVideoFromStorage();
    } else {
      // Clean up any existing URL
      if (videoUrl) {
        revokeVideoUrl(videoUrl);
        setVideoUrl(null);
      }
    }

    return () => {
      if (videoUrl) {
        revokeVideoUrl(videoUrl);
      }
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, [isDownloaded, competitionCode, matchNumber]);

  async function loadVideoFromStorage() {
    try {
      setIsLoadingVideo(true);
      setError(null);
      const url = await getVideoUrl(competitionCode, matchNumber);
      if (url) {
        setVideoUrl(url);
      } else {
        // Video file missing from OPFS (likely deleted) — refresh parent state
        console.warn(
          `Video file not found for match ${matchNumber}, refreshing state`,
        );
        onDownloadComplete?.();
      }
    } catch (err) {
      console.error('Failed to load video from storage:', err);
      // Refresh parent state so it re-reads the DB record
      onDownloadComplete?.();
    } finally {
      setIsLoadingVideo(false);
    }
  }

  function handleDownload() {
    setError(null);
    startDownload(matchNumber, () => {
      onDownloadComplete?.();
    });
  }

  // Downloaded: show video player
  if (isDownloaded && videoUrl) {
    return (
      <Card
        variant='outline'
        className='w-[calc(100%+2rem)] -mx-4 aspect-video p-0 mb-2 overflow-hidden'
      >
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          preload='metadata'
          onLoadedMetadata={() => {
            if (videoRef.current) videoRef.current.currentTime = 0;
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            backgroundColor: '#000',
          }}
        />
      </Card>
    );
  }

  // Loading video from storage
  if (isDownloaded && isLoadingVideo) {
    return (
      <Card
        variant='outline'
        className='w-[calc(100%+2rem)] -mx-4 aspect-video p-0 mb-2 overflow-hidden'
      >
        <Center className='items-center justify-center h-full'>
          <ActivityIndicator size='large' />
          <Text className='text-typography-500 mt-2'>Loading video...</Text>
        </Center>
      </Card>
    );
  }

  // Available but not downloaded: show download button
  if (isAvailable) {
    return (
      <Card
        variant='outline'
        className='w-[calc(100%+2rem)] -mx-4 aspect-video p-0 mb-2'
      >
        <Center className='items-center justify-center h-full'>
          <VStack space='sm' className='items-center w-3/4 max-w-xs'>
            {error && <Text className='text-error-500 text-sm'>{error}</Text>}
            {isDownloading ? (
              <>
                <HStack className='justify-between items-center w-full'>
                  <Text className='text-typography-600 text-sm'>
                    Downloading...
                  </Text>
                  <Text className='text-typography-600 text-sm'>
                    {progress}%
                  </Text>
                </HStack>
                <Progress value={progress} size='md' className='w-full'>
                  <ProgressFilledTrack className='bg-primary-500' />
                </Progress>
              </>
            ) : (
              <>
                <Text className='text-typography-500'>Video Available</Text>
                <Button
                  size='sm'
                  variant='solid'
                  action='primary'
                  onPress={handleDownload}
                >
                  <Icon as={Download} size='md' className='text-typography-0' />
                  <ButtonText>Download</ButtonText>
                </Button>
              </>
            )}
          </VStack>
        </Center>
      </Card>
    );
  }

  // Not available
  return (
    <Card
      variant='outline'
      className='w-[calc(100%+2rem)] -mx-4 aspect-video p-0 mb-2'
    >
      <Center className='items-center justify-center h-full'>
        <VStack space='sm' className='items-center'>
          <Icon as={VideoOff} size='xl' className='text-typography-400' />
          <Text className='text-typography-500'>Video Not Available</Text>
        </VStack>
      </Center>
    </Card>
  );
});
