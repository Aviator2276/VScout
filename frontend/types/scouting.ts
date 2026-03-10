export type RobotAction =
  | 'traversing'
  | 'shooting'
  | 'defending'
  | 'intake'
  | 'outtake'
  | 'herding'
  | 'climbing'
  | 'disabled';

export interface ActionSegment {
  duration: number;
  action: RobotAction;
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
}
