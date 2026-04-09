export interface Team {
  number: number;
  name: string;
  competitionCode?: string;
}

export interface TeamComment {
  id: number;
  team_number: number;
  comment: string;
  created_at: number;
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
  pictureHash?: string; // Hash of the picture for sync detection
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
  tags: string[];
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
  median_auto_fuel?: number;
  sd_auto_fuel?: number;
  median_tele_fuel?: number;
  sd_tele_fuel?: number;
  median_climb_level?: number;
  sd_climb_level?: number;
  median_points_contributed?: number;
  sd_points_contributed?: number;
  local_consistency?: number;
  // Percentiles (0-100, compared to all teams in competition)
  percentile_median_fuel?: number;
  percentile_median_auto_fuel?: number;
  percentile_avg_shooting_time?: number;
  percentile_avg_shooting_interval?: number;
  percentile_avg_intake_herding_interval?: number;
  percentile_avg_disabled_time?: number;
  percentile_avg_defense_time?: number;
  // Average time stats (seconds per match)
  avg_shooting_time?: number;
  avg_shooting_interval?: number;
  avg_intake_herding_interval?: number;
  avg_disabled_time?: number;
  avg_defense_time?: number;
  // Local-only personal notes
  personal_notes?: string;
}
