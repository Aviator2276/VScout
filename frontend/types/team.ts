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
  ranking_points: string;
  tie: number;
  win: number;
  lose: number;
  team_number: number;
  competition: Competition;
  competitionCode?: string; // Flattened field for IndexedDB indexing
  picture: string;
  prescout_drivetrain: string;
  prescout_hopper_size: number;
  prescout_intake_type: string;
  prescout_rotate_yaw: boolean;
  prescout_rotate_pitch: boolean;
  prescout_range: string;
  prescout_driver_years: number;
  prescout_additional_comments: string;
  accuracy: string;
  avg_fuel_scored: string;
  avg_shuttle: string;
  avg_auto_fuel: string;
  avg_climb_points: string;
  avg_auto_fuel_sd: string;
  avg_fuel_sd: string;
  avg_climb_points_sd: string;
  avg_points_contributed: string;
  consistency_rating: string;
}
