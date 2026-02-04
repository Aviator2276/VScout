export interface Team {
  number: number;
  name: string;
  competitionCode?: string;
}

export interface Competition {
  name: string;
  code: string;
  offset_stream_time_to_unix_timestamp_day_1: number;
  offset_stream_time_to_unix_timestamp_day_2: number;
  offset_stream_time_to_unix_timestamp_day_3: number;
}

export interface TeamInfo {
  rank: number;
  ranking_points: number;
  tie: number;
  win: number;
  lose: number;
  team_number: number;
  competition: Competition;
  picture: string;
  prescout_drivetrain: string;
  prescout_hopper_size: number;
  prescout_intake_type: string;
  prescout_rotate_yaw: boolean;
  prescout_rotate_pitch: boolean;
  prescout_self_reported_accuracy: number;
  prescout_unload_time: number;
  prescout_range: string;
  prescout_climber: string;
  prescout_climber_auto: boolean;
  prescout_self_reported_auto_shoot: number;
  prescout_additional_comments: string;
  accuracy: number;
  avg_fuel_scored: number;
  avg_shuttle: number;
  avg_auto_fuel: number;
  avg_climb_points: number;
  avg_alliance_match_points: number;
  auto_success: number;
  auto_success_sd: number;
  climb_success: number;
  climb_success_sd: number;
  avg_points_contributed: number;
  consistency_rating: number;
}
