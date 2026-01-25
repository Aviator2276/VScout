export interface Team {
  number: number;
  name: string;
  competitionCode?: string;
}

export interface TeamInfo {
  team: {
    number: number;
    name: string;
  };
  competition: {
    name: string;
    code: string;
  };
  ranking_points: number;
  tie: number;
  win: number;
  lose: number;
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
}
