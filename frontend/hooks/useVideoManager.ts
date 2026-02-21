import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/utils/db';
import { MatchVideo, VideoSelectionMode, VideoDynamicDownloading, VideoAutoDelete } from '@/types/video';
import { Match } from '@/types/match';
import { fetchVideo, deleteLocalVideo, syncVideoAvailability } from '@/api/videos';
import { useNetworkQuality, NetworkQuality } from '@/hooks/useNetworkQuality';

export type MatchStatus = 'played' | 'current' | 'upcoming';

export interface VideoListItem {
  match_number: number;
  match_type: string;
  isAvailable: boolean;
  isDownloaded: boolean;
  downloadedAt?: number;
  autoDownloaded?: boolean;
  matchStatus: MatchStatus;
}

interface VideoManagerState {
  videos: VideoListItem[];
  selectedVideos: Set<number>;
  isLoading: boolean;
  isDownloading: boolean;
  isPaused: boolean;
  videoSelectionMode: VideoSelectionMode;
  videoDynamicDownloading: VideoDynamicDownloading;
  videoAutoDelete: VideoAutoDelete;
  networkQuality: NetworkQuality;
}

interface VideoManagerActions {
  toggleSelect: (matchNumber: number) => void;
  selectAll: () => void;
  deselectAll: () => void;
  startDownloads: () => void;
  pauseDownloads: () => void;
  deleteSelected: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useVideoManager(): VideoManagerState & VideoManagerActions {
  const [videos, setVideos] = useState<VideoListItem[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [videoSelectionMode, setVideoSelectionMode] = useState<VideoSelectionMode>('none');
  const [videoDynamicDownloading, setVideoDynamicDownloading] = useState<VideoDynamicDownloading>('manual');
  const [videoAutoDelete, setVideoAutoDelete] = useState<VideoAutoDelete>('no');
  const { quality: networkQuality } = useNetworkQuality();
  const downloadAbortRef = useRef(false);

  useEffect(() => {
    loadConfig();
    loadVideos();
  }, []);

  // Auto-delete check when videos or config change
  useEffect(() => {
    if (videoAutoDelete === 'auto' && videoSelectionMode === 'auto') {
      performAutoDelete();
    }
  }, [videos.length, videoAutoDelete, videoSelectionMode]);

  async function loadConfig() {
    try {
      const [selectionMode, dynamicDownloading, autoDelete] = await Promise.all([
        db.config.get({ key: 'videoSelectionMode' }),
        db.config.get({ key: 'videoDynamicDownloading' }),
        db.config.get({ key: 'videoAutoDelete' }),
      ]);

      if (selectionMode?.value) {
        setVideoSelectionMode(selectionMode.value as VideoSelectionMode);
      }
      if (dynamicDownloading?.value) {
        setVideoDynamicDownloading(dynamicDownloading.value as VideoDynamicDownloading);
      }
      if (autoDelete?.value) {
        setVideoAutoDelete(autoDelete.value as VideoAutoDelete);
      }
    } catch (error) {
      console.error('Failed to load video config:', error);
    }
  }

  async function loadVideos() {
    try {
      setIsLoading(true);
      const compCode = (await db.config.get({ key: 'compCode' }))?.value;
      if (!compCode) {
        setVideos([]);
        return;
      }

      // Sync availability from match data
      await syncVideoAvailability();

      // Get all matches and video records
      const [matches, videoRecords] = await Promise.all([
        db.matches.where('competitionCode').equals(compCode).toArray(),
        db.matchVideos.where('competitionCode').equals(compCode).toArray(),
      ]);

      // Build a map of video records keyed by match_number
      const videoMap = new Map<number, MatchVideo>();
      for (const vr of videoRecords) {
        videoMap.set(vr.match_number, vr);
      }

      // Sort matches by match_number
      const sortedMatches = matches.sort((a, b) => a.match_number - b.match_number);

      // Find the current match (first unplayed match after all played matches)
      const playedMatches = sortedMatches.filter((m) => m.has_played);
      const lastPlayedNumber = playedMatches.length > 0 
        ? Math.max(...playedMatches.map((m) => m.match_number)) 
        : 0;
      const upcomingMatches = sortedMatches.filter((m) => !m.has_played);
      const currentMatchNumber = upcomingMatches.length > 0 
        ? Math.min(...upcomingMatches.map((m) => m.match_number)) 
        : null;

      // Build video list from all matches
      const videoList: VideoListItem[] = sortedMatches.map((match) => {
        const vr = videoMap.get(match.match_number);
        
        // Determine match status
        let matchStatus: MatchStatus;
        if (match.has_played) {
          matchStatus = 'played';
        } else if (currentMatchNumber !== null && match.match_number === currentMatchNumber) {
          matchStatus = 'current';
        } else {
          matchStatus = 'upcoming';
        }

        return {
          match_number: match.match_number,
          match_type: match.match_type,
          isAvailable: vr?.isAvailable ?? match.isVideoAvailable ?? false,
          isDownloaded: vr?.isDownloaded ?? false,
          downloadedAt: vr?.downloadedAt,
          autoDownloaded: vr?.autoDownloaded,
          matchStatus,
        };
      });

      setVideos(videoList);
    } catch (error) {
      console.error('Failed to load videos:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function performAutoDelete() {
    try {
      const compCode = (await db.config.get({ key: 'compCode' }))?.value;
      if (!compCode) return;

      // Find the latest played match
      const matches = await db.matches
        .where('competitionCode')
        .equals(compCode)
        .toArray();

      const playedMatches = matches
        .filter((m) => m.has_played)
        .sort((a, b) => b.match_number - a.match_number);

      if (playedMatches.length === 0) return;

      const latestPlayed = playedMatches[0].match_number;
      const threshold = latestPlayed - 10;

      // Delete videos for matches older than threshold
      const videosToDelete = await db.matchVideos
        .where('competitionCode')
        .equals(compCode)
        .filter((v) => v.isDownloaded && v.match_number < threshold)
        .toArray();

      for (const video of videosToDelete) {
        await deleteLocalVideo(video.match_number);
        console.log(`Auto-deleted video for match ${video.match_number}`);
      }

      if (videosToDelete.length > 0) {
        await loadVideos();
      }
    } catch (error) {
      console.error('Failed to perform auto-delete:', error);
    }
  }

  const toggleSelect = useCallback((matchNumber: number) => {
    setSelectedVideos((prev) => {
      const next = new Set(prev);
      if (next.has(matchNumber)) {
        next.delete(matchNumber);
      } else {
        next.add(matchNumber);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedVideos(new Set(videos.map((v) => v.match_number)));
  }, [videos]);

  const deselectAll = useCallback(() => {
    setSelectedVideos(new Set());
  }, []);

  const startDownloads = useCallback(() => {
    setIsPaused(false);
    downloadAbortRef.current = false;
    processDownloadQueue();
  }, [videos, videoSelectionMode, videoDynamicDownloading, networkQuality, selectedVideos]);

  const pauseDownloads = useCallback(() => {
    setIsPaused(true);
    downloadAbortRef.current = true;
  }, []);

  async function processDownloadQueue() {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const compCode = (await db.config.get({ key: 'compCode' }))?.value;
      if (!compCode) return;

      // Determine which videos to download
      let toDownload: VideoListItem[];
      if (videoSelectionMode === 'auto') {
        // Auto mode: download all available, not yet downloaded, not auto-downloaded before
        toDownload = videos.filter(
          (v) => v.isAvailable && !v.isDownloaded && !v.autoDownloaded,
        );
      } else if (videoSelectionMode === 'manual') {
        // Manual mode: download selected videos that are available and not downloaded
        toDownload = videos.filter(
          (v) => selectedVideos.has(v.match_number) && v.isAvailable && !v.isDownloaded,
        );
      } else {
        // None mode: no downloads
        toDownload = [];
      }

      for (const video of toDownload) {
        if (downloadAbortRef.current) break;

        // Check network condition if optimal mode
        if (videoDynamicDownloading === 'optimal' && networkQuality !== 'good') {
          console.log('Network not optimal, pausing downloads');
          setIsPaused(true);
          break;
        }

        // TODO: Actually download the video when backend is ready
        const blob = await fetchVideo(video.match_number);
        if (blob) {
          // TODO: Store blob locally
          await db.matchVideos.update([compCode, video.match_number], {
            isDownloaded: true,
            downloadedAt: Date.now(),
            autoDownloaded: videoSelectionMode === 'auto' ? true : undefined,
          });
        }
      }
    } catch (error) {
      console.error('Download queue error:', error);
    } finally {
      setIsDownloading(false);
      await loadVideos();
    }
  }

  const deleteSelected = useCallback(async () => {
    try {
      const selected = Array.from(selectedVideos);
      for (const matchNumber of selected) {
        await deleteLocalVideo(matchNumber);
      }
      setSelectedVideos(new Set());
      await loadVideos();
    } catch (error) {
      console.error('Failed to delete selected videos:', error);
    }
  }, [selectedVideos]);

  const refresh = useCallback(async () => {
    await loadConfig();
    await loadVideos();
  }, []);

  return {
    videos,
    selectedVideos,
    isLoading,
    isDownloading,
    isPaused,
    videoSelectionMode,
    videoDynamicDownloading,
    videoAutoDelete,
    networkQuality,
    toggleSelect,
    selectAll,
    deselectAll,
    startDownloads,
    pauseDownloads,
    deleteSelected,
    refresh,
  };
}
