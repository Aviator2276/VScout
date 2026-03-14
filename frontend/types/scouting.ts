export type RobotAction =
  | 'traversing'
  | 'shooting'
  | 'defending'
  | 'intake'
  | 'outtake'
  | 'herding'
  | 'climbing'
  | 'disabled'
  | 'missed';

export interface ActionSegment {
  duration: number;
  action: RobotAction;
  fuel?: number;
}

export interface RobotActionRecord {
  competitionCode: string;
  match_type: string;
  set_number: number;
  match_number: number;
  team_number: number;
  auto: ActionSegment[];
  tele: ActionSegment[];
  notes?: string;
  auto_fuel?: number;
  tele_fuel?: number;
}
