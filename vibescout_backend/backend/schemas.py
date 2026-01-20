from ninja import Schema, ModelSchema
from typing import Optional
from .models import Team, Competition, TeamInfo


class TeamSchema(ModelSchema):
    class Meta:
        model = Team
        fields = ['id', 'number', 'name']


class TeamCreateSchema(Schema):
    number: int
    name: str


class TeamUpdateSchema(Schema):
    number: Optional[int] = None
    name: Optional[str] = None


class CompetitionSchema(ModelSchema):
    class Meta:
        model = Competition
        fields = ['id', 'name']


class CompetitionCreateSchema(Schema):
    name: str


class CompetitionUpdateSchema(Schema):
    name: Optional[str] = None


class TeamInfoSchema(ModelSchema):
    team: TeamSchema
    competition: CompetitionSchema
    
    class Meta:
        model = TeamInfo
        fields = [
            'id', 'ranking_points', 'tie', 'win', 'lose', 'team', 'competition',
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
