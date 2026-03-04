import { db } from '@/utils/db';
import { MatchVideo } from '@/types/video';
import { API_BASE_URL } from '@/utils/api';
import { writeVideo, deleteVideo } from '@/utils/videoStorage';

/**
 * Download a video from the server for a given match.
 * Calls GET /api/competitions/{competition_code}/matches/{match_number}/video
 * and stores the result in OPFS.
 * @param matchNumber - The match number to download
 * @param onProgress - Optional callback for download progress (0-100)
 * @returns The video blob size in bytes, or null if unavailable/failed
 */
export async function fetchAndStoreVideo(
  matchNumber: number,
  onProgress?: (progress: number) => void,
  onStart?: () => void,
): Promise<number | null> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return null;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/competitions/${encodeURIComponent(compCode)}/matches/${matchNumber}/video`,
    );

    if (!response.ok) {
      if (response.status === 404) {
        // Mark video as unavailable so it won't be retried
        const existing = await db.matchVideos.get([compCode, matchNumber]);
        if (existing) {
          await db.matchVideos.update([compCode, matchNumber], {
            isAvailable: false,
          });
        }
      }
      console.warn(`Video fetch failed for match ${matchNumber}: ${response.status}`);
      return null;
    }

    // Video exists — notify caller to show progress
    onStart?.();

    // Get content length for progress tracking
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    let blob: Blob;

    // Use streaming progress if we have a progress callback and readable body
    if (onProgress && response.body) {
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value.buffer as ArrayBuffer);
        loaded += value.length;

        if (total > 0) {
          // Exact progress when content-length is known
          onProgress(Math.min(Math.round((loaded / total) * 100), 99));
        } else {
          // Estimate progress without content-length (assume ~20MB typical video)
          const estimated = Math.min(Math.round((loaded / (20 * 1024 * 1024)) * 100), 95);
          onProgress(estimated);
        }
      }

      blob = new Blob(chunks);
    } else {
      // Fallback to simple blob() if no progress tracking needed
      blob = await response.blob();
    }

    if (!blob || blob.size === 0) {
      console.warn(`Empty video response for match ${matchNumber}`);
      return null;
    }

    // Store to OPFS
    const fileSize = await writeVideo(compCode, matchNumber, blob);

    // Update DB record
    const existing = await db.matchVideos.get([compCode, matchNumber]);
    if (existing) {
      await db.matchVideos.update([compCode, matchNumber], {
        isDownloaded: true,
        downloadedAt: Date.now(),
        fileSize,
      });
    } else {
      await db.matchVideos.put({
        competitionCode: compCode,
        match_number: matchNumber,
        match_type: '',
        isAvailable: true,
        isDownloaded: true,
        downloadedAt: Date.now(),
        fileSize,
      });
    }

    // Signal completion
    if (onProgress) {
      onProgress(100);
    }

    return fileSize;
  } catch (error) {
    console.error(`Failed to fetch/store video for match ${matchNumber}:`, error);
    return null;
  }
}

/**
 * Delete a locally stored video for a given match from OPFS and update DB.
 */
export async function deleteLocalVideo(
  matchNumber: number,
): Promise<void> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return;

  // Delete actual video file from OPFS (catch errors so DB is still updated)
  try {
    await deleteVideo(compCode, matchNumber);
  } catch (err) {
    console.warn(`Failed to delete video file for match ${matchNumber}:`, err);
  }

  // Update DB record
  const existing = await db.matchVideos.get([compCode, matchNumber]);
  if (existing) {
    await db.matchVideos.update([compCode, matchNumber], {
      isDownloaded: false,
      downloadedAt: undefined,
      fileSize: undefined,
    });
  }
}

/**
 * Sync video availability for all matches by checking the video_available field
 * on cached match data. Creates/updates matchVideos records accordingly.
 * TODO: When backend provides per-match availability, this can also call an API.
 */
export async function syncVideoAvailability(): Promise<void> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return;

  const matches = await db.matches
    .where('competitionCode')
    .equals(compCode)
    .toArray();

  for (const match of matches) {
    const existing = await db.matchVideos.get([compCode, match.match_number]);
    const isAvailable = match.video_available ?? false;

    if (existing) {
      if (existing.isAvailable !== isAvailable) {
        await db.matchVideos.update([compCode, match.match_number], {
          isAvailable,
        });
      }
    } else {
      await db.matchVideos.put({
        competitionCode: compCode,
        match_number: match.match_number,
        match_type: match.match_type,
        isAvailable,
        isDownloaded: false,
      });
    }
  }
}
