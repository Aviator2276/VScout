import { useState, useEffect, useCallback } from 'react';
import { db } from '@/utils/db';
import { MatchVideo, VideoSelectionMode } from '@/types/video';
import { deleteLocalVideo, syncVideoAvailability } from '@/api/videos';
import { useNetworkQuality, NetworkQuality } from '@/hooks/useNetworkQuality';
import { useVideoDownload } from '@/contexts/VideoDownloadContext';

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
  videoSelectionMode: VideoSelectionMode;
  networkQuality: NetworkQuality;
  downloadProgress: Map<number, number>;
  downloadQueue: number[];
}

interface VideoManagerActions {
  toggleSelect: (matchNumber: number) => void;
  selectAll: () => void;
  deselectAll: () => void;
  startDownloads: () => void;
  cancelDownloads: () => void;
  deleteSelected: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useVideoManager(): VideoManagerState & VideoManagerActions {
  const [videos, setVideos] = useState<VideoListItem[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [videoSelectionMode, setVideoSelectionMode] = useState<VideoSelectionMode>('manual');
  const { quality: networkQuality } = useNetworkQuality();
  const {
    downloadProgress,
    downloadQueue,
    addToQueue,
    cancelAllDownloads,
    isProcessingQueue,
    lastCompletedAt,
  } = useVideoDownload();

  useEffect(() => {
    loadConfig();
    loadVideos();
  }, []);

  useEffect(() => {
    if (lastCompletedAt > 0) {
      loadVideos();
    }
  }, [lastCompletedAt]);

  async function loadConfig() {
    try {
      const selectionMode = await db.config.get({ key: 'videoSelectionMode' });

      if (selectionMode?.value && (selectionMode.value === 'manual' || selectionMode.value === 'auto')) {
        setVideoSelectionMode(selectionMode.value as VideoSelectionMode);
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
          isAvailable: vr?.isAvailable ?? match.video_available ?? false,
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
    let toQueue: number[];
    if (videoSelectionMode === 'auto') {
      toQueue = videos
        .filter((v) => v.isAvailable && !v.isDownloaded && !v.autoDownloaded)
        .map((v) => v.match_number);
      addToQueue(toQueue, true);
    } else {
      toQueue = videos
        .filter((v) => selectedVideos.has(v.match_number) && v.isAvailable && !v.isDownloaded)
        .map((v) => v.match_number);
      addToQueue(toQueue, false);
    }
    setSelectedVideos(new Set());
  }, [videos, videoSelectionMode, selectedVideos, addToQueue]);

  const cancelDownloads = useCallback(() => {
    cancelAllDownloads();
  }, [cancelAllDownloads]);

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
    isDownloading: isProcessingQueue,
    videoSelectionMode,
    networkQuality,
    downloadProgress,
    downloadQueue,
    toggleSelect,
    selectAll,
    deselectAll,
    startDownloads,
    cancelDownloads,
    deleteSelected,
    refresh,
  };
}
