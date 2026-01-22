from ninja import Schema, ModelSchema
from typing import Optional
from .models import Team, Competition, TeamInfo, Match


class TeamSchema(ModelSchema):
    class Meta:
        model = Team
        fields = ['number', 'name']


class CompetitionSchema(ModelSchema):
    class Meta:
        model = Competition
        fields = ['name', 'code']


class TeamInfoSchema(ModelSchema):
    team: TeamSchema
    competition: CompetitionSchema
    
    class Meta:
        model = TeamInfo
        fields = [
            'ranking_points', 'tie', 'win', 'lose', 'team', 'competition',
            'picture', 'prescout_drivetrain', 'prescout_hopper_size', 
            'prescout_intake_type', 'prescout_rotate_yaw', 'prescout_rotate_pitch',
            'prescout_self_reported_accuracy', 'prescout_unload_time', 
            'prescout_range', 'prescout_climber', 'prescout_climber_auto',
            'prescout_self_reported_auto_shoot', 'prescout_additional_comments',
            'accuracy', 'avg_fuel_scored', 'avg_shuttle', 'avg_auto_fuel', 
            'avg_climb_points'
        ]


class TeamInfoCreateSchema(Schema):
    team_id: int
    competition_id: int
    ranking_points: float = 0.0
    tie: int = 0
    win: int = 0
    lose: int = 0
    prescout_drivetrain: Optional[str] = None
    prescout_hopper_size: Optional[int] = None
    prescout_intake_type: Optional[str] = None
    prescout_rotate_yaw: bool = False
    prescout_rotate_pitch: bool = False
    prescout_self_reported_accuracy: Optional[float] = None
    prescout_unload_time: Optional[float] = None
    prescout_range: Optional[str] = None
    prescout_climber: Optional[str] = None
    prescout_climber_auto: bool = False
    prescout_self_reported_auto_shoot: int = 0
    prescout_additional_comments: Optional[str] = None
    accuracy: Optional[float] = None
    avg_fuel_scored: Optional[float] = None
    avg_shuttle: Optional[float] = None
    avg_auto_fuel: Optional[float] = None
    avg_climb_points: Optional[float] = None


class TeamInfoUpdateSchema(Schema):
    ranking_points: Optional[float] = None
    tie: Optional[int] = None
    win: Optional[int] = None
    lose: Optional[int] = None
    prescout_drivetrain: Optional[str] = None
    prescout_hopper_size: Optional[int] = None
    prescout_intake_type: Optional[str] = None
    prescout_rotate_yaw: Optional[bool] = None
    prescout_rotate_pitch: Optional[bool] = None
    prescout_self_reported_accuracy: Optional[float] = None
    prescout_unload_time: Optional[float] = None
    prescout_range: Optional[str] = None
    prescout_climber: Optional[str] = None
    prescout_climber_auto: Optional[bool] = None
    prescout_self_reported_auto_shoot: Optional[int] = None
    prescout_additional_comments: Optional[str] = None
    accuracy: Optional[float] = None
    avg_fuel_scored: Optional[float] = None
    avg_shuttle: Optional[float] = None
    avg_auto_fuel: Optional[float] = None
    avg_climb_points: Optional[float] = None

class PrescouttingUpdateSchema(Schema):
    prescout_drivetrain: Optional[str] = None
    prescout_hopper_size: Optional[int] = None
    prescout_intake_type: Optional[str] = None
    prescout_rotate_yaw: Optional[bool] = None
    prescout_rotate_pitch: Optional[bool] = None
    prescout_self_reported_accuracy: Optional[float] = None
    prescout_unload_time: Optional[float] = None
    prescout_range: Optional[str] = None
    prescout_climber: Optional[str] = None
    prescout_climber_auto: Optional[bool] = None
    prescout_self_reported_auto_shoot: Optional[int] = None
    prescout_additional_comments: Optional[str] = None


class MatchSchema(ModelSchema):
    blue_team_1: TeamSchema
    blue_team_2: TeamSchema
    blue_team_3: TeamSchema
    red_team_1: TeamSchema
    red_team_2: TeamSchema
    red_team_3: TeamSchema
    competition: CompetitionSchema
    
    class Meta:
        model = Match
        fields = [
            'competition', 'match_number', 'blue_team_1', 'blue_team_2', 'blue_team_3',
            'red_team_1', 'red_team_2', 'red_team_3', 'total_points',
            'total_blue_fuels', 'total_red_fuels', 'blue_1_auto_fuel',
            'blue_2_auto_fuel', 'blue_3_auto_fuel', 'red_1_auto_fuel',
            'red_2_auto_fuel', 'red_3_auto_fuel', 'blue_1_teleop_fuel',
            'blue_2_teleop_fuel', 'blue_3_teleop_fuel', 'red_1_teleop_fuel',
            'red_2_teleop_fuel', 'red_3_teleop_fuel', 'blue_1_fuel_scored',
            'blue_2_fuel_scored', 'blue_3_fuel_scored', 'red_1_fuel_scored',
            'red_2_fuel_scored', 'red_3_fuel_scored', 'calculated_points'
        ]


class MatchCreateSchema(Schema):
    competition_id: int
    match_number: int
    blue_team_1_id: int
    blue_team_2_id: int
    blue_team_3_id: int
    red_team_1_id: int
    red_team_2_id: int
    red_team_3_id: int
    total_points: int = 0
    total_blue_fuels: int = 0
    total_red_fuels: int = 0
    blue_1_auto_fuel: int = 0
    blue_2_auto_fuel: int = 0
    blue_3_auto_fuel: int = 0
    red_1_auto_fuel: int = 0
    red_2_auto_fuel: int = 0
    red_3_auto_fuel: int = 0
    blue_1_teleop_fuel: int = 0
    blue_2_teleop_fuel: int = 0
    blue_3_teleop_fuel: int = 0
    red_1_teleop_fuel: int = 0
    red_2_teleop_fuel: int = 0
    red_3_teleop_fuel: int = 0
    blue_1_fuel_scored: int = 0
    blue_2_fuel_scored: int = 0
    blue_3_fuel_scored: int = 0
    red_1_fuel_scored: int = 0
    red_2_fuel_scored: int = 0
    red_3_fuel_scored: int = 0
    calculated_points: int = 0


class MatchUpdateSchema(Schema):
    match_number: Optional[int] = None
    total_points: Optional[int] = None
    total_blue_fuels: Optional[int] = None
    total_red_fuels: Optional[int] = None
    blue_1_auto_fuel: Optional[int] = None
    blue_2_auto_fuel: Optional[int] = None
    blue_3_auto_fuel: Optional[int] = None
    red_1_auto_fuel: Optional[int] = None
    red_2_auto_fuel: Optional[int] = None
    red_3_auto_fuel: Optional[int] = None
    blue_1_teleop_fuel: Optional[int] = None
    blue_2_teleop_fuel: Optional[int] = None
    blue_3_teleop_fuel: Optional[int] = None
    red_1_teleop_fuel: Optional[int] = None
    red_2_teleop_fuel: Optional[int] = None
    red_3_teleop_fuel: Optional[int] = None
    blue_1_fuel_scored: Optional[int] = None
    blue_2_fuel_scored: Optional[int] = None
    blue_3_fuel_scored: Optional[int] = None
    red_1_fuel_scored: Optional[int] = None
    red_2_fuel_scored: Optional[int] = None
    red_3_fuel_scored: Optional[int] = None
    calculated_points: Optional[int] = None
