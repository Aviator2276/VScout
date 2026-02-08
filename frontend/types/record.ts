import { Team } from './team';

export interface RecordInfo {
  status: string;
  competitionCode: string;
  created_at: number;
  last_retry: number;
  archived: boolean;
}

export interface MatchRecord {
  info: RecordInfo;
  team: Team;
  set_number: number;
  match_type: string;
  match_number: number;
}
export interface PrescoutRecord {
  info: RecordInfo;
  team: Team;
  prescout_drivetrain: string;
  prescout_hopper_size: number;
  prescout_intake_type: string;
  prescout_rotate_yaw: boolean;
  prescout_rotate_pitch: boolean;
  prescout_range: string;
  prescout_additional_comments: string;
}
export interface PictureRecord {
  info: RecordInfo;
  team: Team;
  picture: string;
}
