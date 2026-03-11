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
import { VideoSelectionMode } from '@/types/video';

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
  /** Current download queue (match numbers) */
  downloadQueue: number[];
  /** Add match numbers to the download queue */
  addToQueue: (matchNumbers: number[], markAutoDownloaded?: boolean) => void;
  /** Cancel all downloads and clear the queue */
  cancelAllDownloads: () => void;
  /** Whether the queue is currently being processed */
  isProcessingQueue: boolean;
  /** Timestamp of last completed download (for triggering UI refreshes) */
  lastCompletedAt: number;
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
  const [downloadQueue, setDownloadQueue] = useState<number[]>([]);
  const downloadQueueRef = useRef<number[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const isProcessingRef = useRef(false);
  const abortQueueRef = useRef(false);
  const [lastCompletedAt, setLastCompletedAt] = useState(0);
  const autoDownloadedSetRef = useRef<Set<number>>(new Set());

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
  const lastProcessedRefresh = useRef<string | null>(null);

  useEffect(() => {
    if (!lastDataUpdate) return;

    const refreshKey = lastDataUpdate.toISOString();
    if (lastProcessedRefresh.current === refreshKey) return;
    lastProcessedRefresh.current = refreshKey;

    checkAutoDownload();
  }, [lastDataUpdate]);

  async function checkAutoDownload() {
    try {
      const selModeRecord = await db.config.get({ key: 'videoSelectionMode' });
      const selectionMode = (selModeRecord?.value as VideoSelectionMode) || 'manual';

      if (selectionMode !== 'auto') return;

      await syncVideoAvailability();

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

      console.log(`[Auto-download] Queueing ${toDownload.length} new videos`);
      addToQueue(
        toDownload.map((v) => v.match_number),
        true,
      );
    } catch (error) {
      console.error('[Auto-download] Failed:', error);
    }
  }

  const addToQueue = useCallback((matchNumbers: number[], markAutoDownloaded = false) => {
    const existing = new Set(downloadQueueRef.current);
    const newItems = matchNumbers.filter((n) => !existing.has(n) && !activeRef.current.has(n));
    if (newItems.length === 0) return;
    const merged = [...downloadQueueRef.current, ...newItems];
    downloadQueueRef.current = merged;
    setDownloadQueue([...merged]);
    if (markAutoDownloaded) {
      for (const n of newItems) autoDownloadedSetRef.current.add(n);
    }
    if (!isProcessingRef.current) {
      processQueue();
    }
  }, []);

  const cancelAllDownloads = useCallback(() => {
    abortQueueRef.current = true;
    downloadQueueRef.current = [];
    setDownloadQueue([]);
    autoDownloadedSetRef.current.clear();
  }, []);

  async function processQueue() {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessingQueue(true);
    abortQueueRef.current = false;

    try {
      const compCode = (await db.config.get({ key: 'compCode' }))?.value;
      if (!compCode) return;

      while (downloadQueueRef.current.length > 0) {
        if (abortQueueRef.current) break;

        const matchNumber = downloadQueueRef.current[0];

        if (activeRef.current.has(matchNumber)) {
          downloadQueueRef.current = downloadQueueRef.current.slice(1);
          setDownloadQueue([...downloadQueueRef.current]);
          continue;
        }

        const fileSize = await fetchAndStoreVideo(
          matchNumber,
          (progress) => setProgress(matchNumber, progress),
          () => {
            markActive(matchNumber);
            setProgress(matchNumber, 0);
          },
        );

        downloadQueueRef.current = downloadQueueRef.current.slice(1);
        setDownloadQueue([...downloadQueueRef.current]);

        markInactive(matchNumber);
        clearProgress(matchNumber);

        if (fileSize !== null && autoDownloadedSetRef.current.has(matchNumber)) {
          await db.matchVideos.update([compCode, matchNumber], {
            autoDownloaded: true,
          });
          autoDownloadedSetRef.current.delete(matchNumber);
        }

        setLastCompletedAt(Date.now());
      }
    } catch (error) {
      console.error('Download queue error:', error);
    } finally {
      isProcessingRef.current = false;
      setIsProcessingQueue(false);
      downloadQueueRef.current = [];
      setDownloadQueue([]);
      clearAllProgress();
      autoDownloadedSetRef.current.clear();
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
        downloadQueue,
        addToQueue,
        cancelAllDownloads,
        isProcessingQueue,
        lastCompletedAt,
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
