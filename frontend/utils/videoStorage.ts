/**
 * Video Storage Utility using File System API (OPFS - Origin Private File System)
 * 
 * This utility provides methods for caching videos locally using the
 * File System API for persistent storage.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
 */

// Extend FileSystemDirectoryHandle to include entries() method
declare global {
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }
}

const VIDEO_DIRECTORY = 'videos';

/**
 * Check if the File System API is available
 */
export function isFileSystemAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;
}

/**
 * Get the root directory handle for the app's private file system
 */
async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAvailable()) {
    throw new Error('File System API is not available');
  }
  return await navigator.storage.getDirectory();
}

/**
 * Get or create the videos directory
 */
async function getVideosDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDirectory();
  return await root.getDirectoryHandle(VIDEO_DIRECTORY, { create: true });
}

/**
 * Generate a filename for a video based on competition code and match number
 */
function getVideoFilename(competitionCode: string, matchNumber: number): string {
  return `${competitionCode}_match_${matchNumber}.mp4`;
}

/**
 * Write a video file to storage
 * 
 * @param competitionCode - The competition code
 * @param matchNumber - The match number
 * @param videoData - The video data as a Blob
 * @returns The size of the written file in bytes
 */
export async function writeVideo(
  competitionCode: string,
  matchNumber: number,
  videoData: Blob
): Promise<number> {
  const videosDir = await getVideosDirectory();
  const filename = getVideoFilename(competitionCode, matchNumber);
  
  const fileHandle = await videosDir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  
  try {
    await writable.write(videoData);
    await writable.close();
    return videoData.size;
  } catch (error) {
    await writable.abort();
    throw error;
  }
}

/**
 * Read a video file from storage
 * 
 * @param competitionCode - The competition code
 * @param matchNumber - The match number
 * @returns The video data as a Blob, or null if not found
 */
export async function readVideo(
  competitionCode: string,
  matchNumber: number
): Promise<Blob | null> {
  try {
    const videosDir = await getVideosDirectory();
    const filename = getVideoFilename(competitionCode, matchNumber);
    
    const fileHandle = await videosDir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return file;
  } catch (error) {
    // File not found or other error
    return null;
  }
}

/**
 * Delete a video file from storage
 * 
 * @param competitionCode - The competition code
 * @param matchNumber - The match number
 * @returns true if deleted, false if file didn't exist
 */
export async function deleteVideo(
  competitionCode: string,
  matchNumber: number
): Promise<boolean> {
  try {
    const videosDir = await getVideosDirectory();
    const filename = getVideoFilename(competitionCode, matchNumber);
    
    await videosDir.removeEntry(filename);
    return true;
  } catch (error) {
    // File not found or other error
    return false;
  }
}

/**
 * Check if a video exists in storage
 * 
 * @param competitionCode - The competition code
 * @param matchNumber - The match number
 * @returns true if the video exists
 */
export async function videoExists(
  competitionCode: string,
  matchNumber: number
): Promise<boolean> {
  try {
    const videosDir = await getVideosDirectory();
    const filename = getVideoFilename(competitionCode, matchNumber);
    
    await videosDir.getFileHandle(filename);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get the size of a stored video
 * 
 * @param competitionCode - The competition code
 * @param matchNumber - The match number
 * @returns The file size in bytes, or null if not found
 */
export async function getVideoSize(
  competitionCode: string,
  matchNumber: number
): Promise<number | null> {
  try {
    const videosDir = await getVideosDirectory();
    const filename = getVideoFilename(competitionCode, matchNumber);
    
    const fileHandle = await videosDir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return file.size;
  } catch (error) {
    return null;
  }
}

/**
 * List all stored videos
 * 
 * @returns Array of objects containing competition code, match number, and file size
 */
export async function listVideos(): Promise<Array<{
  competitionCode: string;
  matchNumber: number;
  size: number;
  filename: string;
}>> {
  try {
    const videosDir = await getVideosDirectory();
    const videos: Array<{
      competitionCode: string;
      matchNumber: number;
      size: number;
      filename: string;
    }> = [];
    
    for await (const [name, handle] of videosDir.entries()) {
      if (handle.kind === 'file' && name.endsWith('.mp4')) {
        // Parse filename: {competitionCode}_match_{matchNumber}.mp4
        const match = name.match(/^(.+)_match_(\d+)\.mp4$/);
        if (match) {
          const fileHandle = handle as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          videos.push({
            competitionCode: match[1],
            matchNumber: parseInt(match[2], 10),
            size: file.size,
            filename: name,
          });
        }
      }
    }
    
    return videos;
  } catch (error) {
    console.error('Failed to list videos:', error);
    return [];
  }
}

/**
 * Delete all videos for a specific competition
 * 
 * @param competitionCode - The competition code
 * @returns The number of videos deleted
 */
export async function deleteVideosByCompetition(competitionCode: string): Promise<number> {
  try {
    const videosDir = await getVideosDirectory();
    let deletedCount = 0;
    
    const filesToDelete: string[] = [];
    
    for await (const [name, handle] of videosDir.entries()) {
      if (handle.kind === 'file' && name.startsWith(`${competitionCode}_match_`)) {
        filesToDelete.push(name);
      }
    }
    
    for (const filename of filesToDelete) {
      try {
        await videosDir.removeEntry(filename);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete video ${filename}:`, error);
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Failed to delete videos by competition:', error);
    return 0;
  }
}

/**
 * Delete all stored videos and clear the videos directory
 * 
 * @returns The number of videos deleted
 */
export async function deleteAllVideos(): Promise<number> {
  try {
    const videosDir = await getVideosDirectory();
    let deletedCount = 0;
    
    const filesToDelete: string[] = [];
    
    for await (const [name, handle] of videosDir.entries()) {
      if (handle.kind === 'file') {
        filesToDelete.push(name);
      }
    }
    
    for (const filename of filesToDelete) {
      try {
        await videosDir.removeEntry(filename);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete video ${filename}:`, error);
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Failed to delete all videos:', error);
    return 0;
  }
}

/**
 * Delete all files stored by the app (videos directory and any other app data)
 * This is used for app reset functionality
 * 
 * @returns true if successful
 */
export async function deleteAllAppFiles(): Promise<boolean> {
  try {
    if (!isFileSystemAvailable()) {
      console.warn('File System API is not available');
      return true; // Return true since there's nothing to delete
    }
    
    const root = await getRootDirectory();
    
    // Collect all entries to delete
    const entriesToDelete: string[] = [];
    
    for await (const [name] of root.entries()) {
      entriesToDelete.push(name);
    }
    
    // Delete all entries (files and directories)
    for (const name of entriesToDelete) {
      try {
        await root.removeEntry(name, { recursive: true });
        console.log(`Deleted: ${name}`);
      } catch (error) {
        console.error(`Failed to delete ${name}:`, error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Failed to delete all app files:', error);
    return false;
  }
}

/**
 * Get total storage used by videos
 * 
 * @returns Total size in bytes
 */
export async function getTotalVideoStorageUsed(): Promise<number> {
  try {
    const videos = await listVideos();
    return videos.reduce((total, video) => total + video.size, 0);
  } catch (error) {
    console.error('Failed to get total video storage:', error);
    return 0;
  }
}

/**
 * Create a URL for a stored video (for playback)
 * 
 * @param competitionCode - The competition code
 * @param matchNumber - The match number
 * @returns Object URL for the video, or null if not found
 */
export async function getVideoUrl(
  competitionCode: string,
  matchNumber: number
): Promise<string | null> {
  const blob = await readVideo(competitionCode, matchNumber);
  if (blob) {
    return URL.createObjectURL(blob);
  }
  return null;
}

/**
 * Revoke a video URL to free memory
 * 
 * @param url - The URL to revoke
 */
export function revokeVideoUrl(url: string): void {
  URL.revokeObjectURL(url);
}
