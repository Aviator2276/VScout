import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { fetchAndStoreVideo, syncVideoAvailability } from '@/api/videos';
import { db } from '@/utils/db';
import { useApp } from '@/contexts/AppContext';
import { useNetworkQuality } from '@/hooks/useNetworkQuality';
import { VideoSelectionMode, VideoDynamicDownloading } from '@/types/video';

interface VideoDownloadContextType {
  /** Start downloading a video for a specific match. Runs in background. */
  startDownload: (matchNumber: number, onComplete?: () => void) => void;
  /** Map of match_number -> download progress (0-100) */
  downloadProgress: Map<number, number>;
  /** Set of match numbers currently being downloaded */
  activeDownloads: Set<number>;
  /** Set progress for a match (used by useVideoManager for batch downloads) */
  setProgress: (matchNumber: number, progress: number) => void;
  /** Clear progress for a match */
  clearProgress: (matchNumber: number) => void;
  /** Clear all progress entries */
  clearAllProgress: () => void;
  /** Mark a match as actively downloading */
  markActive: (matchNumber: number) => void;
  /** Mark a match as no longer downloading */
  markInactive: (matchNumber: number) => void;
  /** Check if a match is currently being downloaded (reads ref, not stale state) */
  isActive: (matchNumber: number) => boolean;
}

const VideoDownloadContext = createContext<VideoDownloadContextType | undefined>(
  undefined,
);

export function VideoDownloadProvider({ children }: { children: ReactNode }) {
  const [downloadProgress, setDownloadProgress] = useState<Map<number, number>>(
    new Map(),
  );
  const [activeDownloads, setActiveDownloads] = useState<Set<number>>(
    new Set(),
  );
  const activeRef = useRef<Set<number>>(new Set());

  const setProgress = useCallback((matchNumber: number, progress: number) => {
    setDownloadProgress((prev) => new Map(prev).set(matchNumber, progress));
  }, []);

  const clearProgress = useCallback((matchNumber: number) => {
    setDownloadProgress((prev) => {
      const next = new Map(prev);
      next.delete(matchNumber);
      return next;
    });
  }, []);

  const clearAllProgress = useCallback(() => {
    setDownloadProgress(new Map());
  }, []);

  const markActive = useCallback((matchNumber: number) => {
    activeRef.current.add(matchNumber);
    setActiveDownloads(new Set(activeRef.current));
  }, []);

  const markInactive = useCallback((matchNumber: number) => {
    activeRef.current.delete(matchNumber);
    setActiveDownloads(new Set(activeRef.current));
  }, []);

  const isActive = useCallback((matchNumber: number) => {
    return activeRef.current.has(matchNumber);
  }, []);

  const startDownload = useCallback(
    (matchNumber: number, onComplete?: () => void) => {
      // Skip if already downloading this match
      if (activeRef.current.has(matchNumber)) return;

      // Mark as active immediately to prevent duplicate starts
      activeRef.current.add(matchNumber);

      // Run the download in the background (fire-and-forget)
      fetchAndStoreVideo(
        matchNumber,
        (progress) => {
          setProgress(matchNumber, progress);
        },
        () => {
          // onStart: only show progress after confirming video exists (not 404)
          setActiveDownloads(new Set(activeRef.current));
          setProgress(matchNumber, 0);
        },
      )
        .then((fileSize) => {
          if (fileSize !== null) {
            onComplete?.();
          }
        })
        .catch((err) => {
          console.error(
            `Background download failed for match ${matchNumber}:`,
            err,
          );
        })
        .finally(() => {
          markInactive(matchNumber);
          clearProgress(matchNumber);
        });
    },
    [],
  );

  // Auto-download: trigger when data refresh completes (lastDataUpdate changes)
  const { lastDataUpdate } = useApp();
  const { quality: networkQuality } = useNetworkQuality();
  const lastProcessedRefresh = useRef<string | null>(null);

  useEffect(() => {
    if (!lastDataUpdate) return;

    const refreshKey = lastDataUpdate.toISOString();
    // Skip if we already processed this refresh
    if (lastProcessedRefresh.current === refreshKey) return;
    lastProcessedRefresh.current = refreshKey;

    checkAutoDownload();
  }, [lastDataUpdate]);

  async function checkAutoDownload() {
    try {
      // Read video config
      const [selModeRecord, dynDlRecord] = await Promise.all([
        db.config.get({ key: 'videoSelectionMode' }),
        db.config.get({ key: 'videoDynamicDownloading' }),
      ]);

      const selectionMode = (selModeRecord?.value as VideoSelectionMode) || 'none';
      const dynamicDownloading = (dynDlRecord?.value as VideoDynamicDownloading) || 'manual';

      // Only auto-download if selection mode is 'auto'
      if (selectionMode !== 'auto') return;

      // Check dynamic downloading preference
      if (dynamicDownloading === 'manual') return;
      if (dynamicDownloading === 'optimal' && networkQuality !== 'good') {
        console.log('[Auto-download] Network not optimal, skipping');
        return;
      }

      // Sync video availability from latest match data
      await syncVideoAvailability();

      // Find available videos that haven't been downloaded or auto-downloaded yet
      const compCode = (await db.config.get({ key: 'compCode' }))?.value;
      if (!compCode) return;

      const videoRecords = await db.matchVideos
        .where('competitionCode')
        .equals(compCode)
        .toArray();

      const toDownload = videoRecords.filter(
        (v) => v.isAvailable && !v.isDownloaded && !v.autoDownloaded,
      );

      if (toDownload.length === 0) return;

      console.log(`[Auto-download] Starting download of ${toDownload.length} videos`);

      for (const video of toDownload) {
        // Skip if already downloading
        if (activeRef.current.has(video.match_number)) continue;

        startDownload(video.match_number, async () => {
          // Mark as auto-downloaded so we don't re-download
          await db.matchVideos.update([compCode, video.match_number], {
            autoDownloaded: true,
          });
        });
      }
    } catch (error) {
      console.error('[Auto-download] Failed:', error);
    }
  }

  return (
    <VideoDownloadContext.Provider
      value={{
        startDownload,
        downloadProgress,
        activeDownloads,
        setProgress,
        clearProgress,
        clearAllProgress,
        markActive,
        markInactive,
        isActive,
      }}
    >
      {children}
    </VideoDownloadContext.Provider>
  );
}

export function useVideoDownload() {
  const context = useContext(VideoDownloadContext);
  if (context === undefined) {
    throw new Error(
      'useVideoDownload must be used within a VideoDownloadProvider',
    );
  }
  return context;
}
