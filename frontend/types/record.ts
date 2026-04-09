import { Team } from './team';

export interface RecordInfo {
  status: string;
  competitionCode: string;
  created_at: number;
  last_retry: number;
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
  prescout_driver_years: number;
  prescout_additional_comments: string;
  prescout_shooter_type: string;
  prescout_trench_travel: boolean;
  prescout_trench_travel_preference: string;
  prescout_has_auto: boolean;
  prescout_has_disruption_auto: boolean;
  prescout_auto_starting_pose: string;
  prescout_auto_depot: boolean;
  prescout_auto_outpost: boolean;
  prescout_auto_crosses_center_line: boolean;
  prescout_auto_climb_level: string;
  prescout_auto_center_sweeps: string;
}
export interface PictureRecord {
  info: RecordInfo;
  team: Team;
  picture: string;
}

export interface ScoutRecord {
  info: RecordInfo;
  team: Team;
  match_type: string;
  set_number: number;
  match_number: number;
  is_playoff: boolean;
  notes?: string;
  auto: { duration: number; action: string }[];
  tele: { duration: number; action: string }[];
}

export interface CommentRecord {
  info: RecordInfo;
  team: Team;
  comment: string;
  local_id: string;
  server_id?: number;
}
