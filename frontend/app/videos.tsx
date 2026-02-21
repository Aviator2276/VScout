import React from 'react';
import { FlatList, ActivityIndicator } from 'react-native';
import { cssInterop } from 'nativewind';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { Center } from '@/components/ui/center';
import { Header } from '@/components/Header';
import { VideoCard } from '@/components/VideoCard';
import { VideoSelectionBar } from '@/components/VideoSelectionBar';
import { VideoStatusHeader } from '@/components/VideoStatusHeader';
import { useVideoManager } from '@/hooks/useVideoManager';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

cssInterop(FlatList, {
  className: {
    target: 'style',
  },
});

export default function VideosScreen() {
  const {
    videos,
    selectedVideos,
    isLoading,
    isDownloading,
    isPaused,
    videoDynamicDownloading,
    networkQuality,
    toggleSelect,
    startDownloads,
    pauseDownloads,
    deleteSelected,
    refresh,
  } = useVideoManager();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, []),
  );

  return (
    <AdaptiveSafeArea>
      <Header title='Match Videos' showBackButton />
      <Box className='flex-1 max-w-2xl self-center w-full'>
        <VideoStatusHeader
          networkQuality={networkQuality}
          isDownloading={isDownloading}
          isPaused={isPaused}
          videoDynamicDownloading={videoDynamicDownloading}
          onStartDownloads={startDownloads}
          onPauseDownloads={pauseDownloads}
        />

        {isLoading ? (
          <Center className='flex-1 px-4'>
            <ActivityIndicator size='large' />
          </Center>
        ) : (
          <FlatList
            className='flex-1 px-4 pt-4'
            data={videos}
            keyExtractor={(item) => `video-${item.match_number}`}
            renderItem={({ item }) => (
              <VideoCard
                video={item}
                isSelected={selectedVideos.has(item.match_number)}
                onToggleSelect={toggleSelect}
              />
            )}
            ListEmptyComponent={() => (
              <Text className='text-center text-typography-500 mt-8'>
                No match videos available
              </Text>
            )}
          />
        )}

        <VideoSelectionBar
          selectedCount={selectedVideos.size}
          onDownload={startDownloads}
          onDelete={deleteSelected}
        />
      </Box>
    </AdaptiveSafeArea>
  );
}
