import { db } from '@/utils/db';
import { MatchVideo } from '@/types/video';

/**
 * TODO: Replace stub implementations with actual API calls when backend routes are available.
 *
 * Expected API routes:
 * - GET /api/match-video/availability?competition_code={code}&match_number={num}
 * - GET /api/match-video?competition_code={code}&match_number={num}
 * - DELETE /api/match-video?competition_code={code}&match_number={num} (local only)
 */

/**
 * Check if a video is available on the server for a given match.
 * TODO: Implement actual API call when backend route is available.
 */
export async function checkVideoAvailability(
  matchNumber: number,
): Promise<{ available: boolean }> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return { available: false };

  // TODO: Replace with actual API call
  // const response = await apiRequest<{ available: boolean }>(
  //   `/api/match-video/availability?competition_code=${encodeURIComponent(compCode)}&match_number=${matchNumber}`,
  // );
  // return response;

  return { available: false };
}

/**
 * Download a video from the server for a given match.
 * TODO: Implement actual API call and local storage when backend route is available.
 * @returns The video blob/data or null if unavailable
 */
export async function fetchVideo(
  matchNumber: number,
): Promise<Blob | null> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return null;

  // TODO: Replace with actual API call
  // const response = await fetch(
  //   `${API_BASE_URL}/api/match-video?competition_code=${encodeURIComponent(compCode)}&match_number=${matchNumber}`,
  // );
  // if (!response.ok) return null;
  // return await response.blob();

  console.log(`[VIDEO STUB] fetchVideo called for match ${matchNumber}`);
  return null;
}

/**
 * Delete a locally stored video for a given match.
 * TODO: Implement actual local storage deletion.
 */
export async function deleteLocalVideo(
  matchNumber: number,
): Promise<void> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return;

  // TODO: Delete actual video blob/file from local storage

  // Update DB record
  const existing = await db.matchVideos.get([compCode, matchNumber]);
  if (existing) {
    await db.matchVideos.update([compCode, matchNumber], {
      isDownloaded: false,
      downloadedAt: undefined,
      // Keep autoDownloaded flag so auto mode doesn't re-download
    });
  }

  console.log(`[VIDEO STUB] deleteLocalVideo called for match ${matchNumber}`);
}

/**
 * Sync video availability for all matches by checking the isVideoAvailable field
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
    const isAvailable = match.isVideoAvailable ?? false;

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
