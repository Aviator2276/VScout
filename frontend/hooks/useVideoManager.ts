import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/utils/db';
import { MatchVideo, VideoSelectionMode, VideoDynamicDownloading, VideoAutoDelete } from '@/types/video';
import { Match } from '@/types/match';
import { fetchAndStoreVideo, deleteLocalVideo, syncVideoAvailability } from '@/api/videos';
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
  isPaused: boolean;
  videoSelectionMode: VideoSelectionMode;
  videoDynamicDownloading: VideoDynamicDownloading;
  videoAutoDelete: VideoAutoDelete;
  networkQuality: NetworkQuality;
  downloadProgress: Map<number, number>;
  downloadQueue: number[];
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
  const { downloadProgress, setProgress, clearProgress, clearAllProgress, markActive, markInactive, isActive } = useVideoDownload();
  const downloadAbortRef = useRef(false);
  const [downloadQueue, setDownloadQueue] = useState<number[]>([]);
  const downloadQueueRef = useRef<number[]>([]);

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

    // Build list of videos to add to queue
    let toQueue: number[];
    if (videoSelectionMode === 'auto') {
      toQueue = videos
        .filter((v) => v.isAvailable && !v.isDownloaded && !v.autoDownloaded)
        .map((v) => v.match_number);
    } else if (videoSelectionMode === 'manual') {
      toQueue = videos
        .filter((v) => selectedVideos.has(v.match_number) && v.isAvailable && !v.isDownloaded)
        .map((v) => v.match_number);
    } else {
      toQueue = [];
    }

    // Merge into existing queue (avoid duplicates)
    const existing = new Set(downloadQueueRef.current);
    const merged = [...downloadQueueRef.current, ...toQueue.filter((n) => !existing.has(n))];
    downloadQueueRef.current = merged;
    setDownloadQueue([...merged]);

    // Only start processing if not already running
    if (!isDownloading) {
      processDownloadQueue();
    }
  }, [videos, videoSelectionMode, videoDynamicDownloading, networkQuality, selectedVideos, isDownloading]);

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

      // Process queue items one at a time, checking for new additions each iteration
      while (downloadQueueRef.current.length > 0) {
        if (downloadAbortRef.current) break;

        // Check network condition if optimal mode
        if (videoDynamicDownloading === 'optimal' && networkQuality !== 'good') {
          console.log('Network not optimal, pausing downloads');
          setIsPaused(true);
          break;
        }

        const matchNumber = downloadQueueRef.current[0];

        // Skip if already being downloaded (e.g., from match page or auto-download)
        if (isActive(matchNumber)) {
          downloadQueueRef.current = downloadQueueRef.current.slice(1);
          setDownloadQueue([...downloadQueueRef.current]);
          continue;
        }

        // Fetch video from API and store in OPFS with progress tracking
        // Progress UI is deferred until onStart (response.ok confirmed, not 404)
        const fileSize = await fetchAndStoreVideo(
          matchNumber,
          (progress) => {
            setProgress(matchNumber, progress);
          },
          () => {
            markActive(matchNumber);
            setProgress(matchNumber, 0);
          },
        );

        // Remove from queue after download attempt
        downloadQueueRef.current = downloadQueueRef.current.slice(1);
        setDownloadQueue([...downloadQueueRef.current]);

        // Clear progress after download completes
        markInactive(matchNumber);
        clearProgress(matchNumber);

        if (fileSize !== null) {
          // Mark as auto-downloaded if in auto mode
          if (videoSelectionMode === 'auto') {
            await db.matchVideos.update([compCode, matchNumber], {
              autoDownloaded: true,
            });
          }
        }
      }
    } catch (error) {
      console.error('Download queue error:', error);
    } finally {
      setIsDownloading(false);
      downloadQueueRef.current = [];
      setDownloadQueue([]);
      clearAllProgress();
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
    downloadProgress,
    downloadQueue,
    toggleSelect,
    selectAll,
    deselectAll,
    startDownloads,
    pauseDownloads,
    deleteSelected,
    refresh,
  };
}
