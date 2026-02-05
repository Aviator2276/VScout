export interface Team {
  number: number;
  name: string;
}

export interface Competition {
  name: string;
  code: string;
  offset_stream_time_to_unix_timestamp_day_1: number;
  offset_stream_time_to_unix_timestamp_day_2: number;
  offset_stream_time_to_unix_timestamp_day_3: number;
}

export interface Match {
  blue_team_1: Team;
  blue_team_2: Team;
  blue_team_3: Team;
  red_team_1: Team;
  red_team_2: Team;
  red_team_3: Team;
  competition: Competition;
  competitionCode?: string; // Flattened field for IndexedDB indexing
  match_number: number;
  set_number: number;
  match_type: string;
  has_played: boolean;
  predicted_match_time: number;
  start_match_time: number;
  end_match_time: number;
  total_points: number;
  total_blue_fuels: number;
  total_red_fuels: number;
  blue_1_auto_fuel: number;
  blue_2_auto_fuel: number;
  blue_3_auto_fuel: number;
  red_1_auto_fuel: number;
  red_2_auto_fuel: number;
  red_3_auto_fuel: number;
  blue_1_teleop_fuel: number;
  blue_2_teleop_fuel: number;
  blue_3_teleop_fuel: number;
  red_1_teleop_fuel: number;
  red_2_teleop_fuel: number;
  red_3_teleop_fuel: number;
  blue_1_fuel_scored: number;
  blue_2_fuel_scored: number;
  blue_3_fuel_scored: number;
  red_1_fuel_scored: number;
  red_2_fuel_scored: number;
  red_3_fuel_scored: number;
  blue_1_climb: string;
  blue_2_climb: string;
  blue_3_climb: string;
  red_1_climb: string;
  red_2_climb: string;
  red_3_climb: string;
  calculated_points: number;
  blue_total_score: number;
  red_total_score: number;
  blue_ranking_points: number;
  red_ranking_points: number;
  winning_alliance: string;
  blue_auto_points: number;
  red_auto_points: number;
  blue_teleop_points: number;
  red_teleop_points: number;
  blue_endgame_points: number;
  red_endgame_points: number;
}
