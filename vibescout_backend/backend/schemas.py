from ninja import Schema, ModelSchema
from typing import Optional
from .models import Team, Competition, TeamInfo, Match, ShotTiming


class TeamSchema(ModelSchema):
    class Meta:
        model = Team
        fields = ['number', 'name']


class CompetitionSchema(ModelSchema):
    class Meta:
        model = Competition
        fields = [
            'name', 'code',
            'offset_stream_time_to_unix_timestamp_day_1',
            'offset_stream_time_to_unix_timestamp_day_2',
            'offset_stream_time_to_unix_timestamp_day_3'
        ]


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
            'competition', 'match_number', 'set_number', 'match_type', 'has_played',
            'predicted_match_time', 'start_match_time', 'end_match_time',
            'blue_team_1', 'blue_team_2', 'blue_team_3',
            'red_team_1', 'red_team_2', 'red_team_3', 'total_points',
            'total_blue_fuels', 'total_red_fuels', 'blue_1_auto_fuel',
            'blue_2_auto_fuel', 'blue_3_auto_fuel', 'red_1_auto_fuel',
            'red_2_auto_fuel', 'red_3_auto_fuel', 'blue_1_teleop_fuel',
            'blue_2_teleop_fuel', 'blue_3_teleop_fuel', 'red_1_teleop_fuel',
            'red_2_teleop_fuel', 'red_3_teleop_fuel', 'blue_1_fuel_scored',
            'blue_2_fuel_scored', 'blue_3_fuel_scored', 'red_1_fuel_scored',
            'red_2_fuel_scored', 'red_3_fuel_scored', 'blue_1_climb',
            'blue_2_climb', 'blue_3_climb', 'red_1_climb', 'red_2_climb',
            'red_3_climb', 'calculated_points'
        ]


class ShotTimingSchema(ModelSchema):
    team: TeamSchema
    
    class Meta:
        model = ShotTiming
        fields = ['team', 'start_shot_time', 'end_shot_time']


class ShotTimingCreateSchema(Schema):
    start_shot_time: float
    end_shot_time: float
