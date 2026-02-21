export interface MatchVideo {
  competitionCode: string;
  match_number: number;
  match_type: string;
  isAvailable: boolean;
  isDownloaded: boolean;
  downloadedAt?: number;
  autoDownloaded?: boolean;
  // TODO: Add these fields when video storage is implemented
  // blobUrl?: string;
  // fileSize?: number;
}

export type VideoSelectionMode = 'none' | 'manual' | 'auto';
export type VideoDynamicDownloading = 'always' | 'optimal' | 'manual';
export type VideoAutoDelete = 'no' | 'auto';
