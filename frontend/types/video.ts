export interface MatchVideo {
  competitionCode: string;
  match_number: number;
  match_type: string;
  isAvailable: boolean;
  isDownloaded: boolean;
  downloadedAt?: number;
  autoDownloaded?: boolean;
  fileSize?: number;
}

export type VideoSelectionMode = 'none' | 'manual' | 'auto';
export type VideoDynamicDownloading = 'always' | 'optimal' | 'manual';
export type VideoAutoDelete = 'no' | 'auto';
