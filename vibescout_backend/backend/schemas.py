from typing import Optional

from django.contrib.auth.models import User
from ninja import ModelSchema, Schema

from .models import Competition, Match, RobotAction, Team, TeamInfo


class TeamSchema(ModelSchema):
    class Meta:
        model = Team
        fields = ["number", "name"]


class CompetitionSchema(ModelSchema):
    class Meta:
        model = Competition
        fields = [
            "name",
            "code",
            "offset_stream_time_to_unix_timestamp_day_1",
            "offset_stream_time_to_unix_timestamp_day_2",
            "offset_stream_time_to_unix_timestamp_day_3",
        ]


class TeamInfoSchema(Schema):
    rank: Optional[int] = None
    ranking_points: float
    tie: int
    win: int
    lose: int
    team_number: int
    competition: CompetitionSchema

    # Prescout fields
    picture: Optional[str] = None
    prescout_drivetrain: Optional[str] = None
    prescout_hopper_size: Optional[int] = None
    prescout_intake_type: Optional[str] = None
    prescout_rotate_yaw: bool
    prescout_rotate_pitch: bool
    prescout_self_reported_accuracy: Optional[float] = None
    prescout_unload_time: Optional[float] = None
    prescout_range: Optional[str] = None
    prescout_climber: Optional[str] = None
    prescout_climber_auto: bool
    prescout_self_reported_auto_shoot: int
    prescout_additional_comments: Optional[str] = None

    # Stats fields
    accuracy: Optional[float] = None
    avg_fuel_scored: Optional[float] = None
    avg_shuttle: Optional[float] = None
    avg_auto_fuel: Optional[float] = None
    avg_climb_points: Optional[float] = None
    avg_alliance_match_points: Optional[float] = None

    # Advanced stats
    auto_success: Optional[float] = None
    auto_success_sd: Optional[float] = None
    climb_success: Optional[float] = None
    climb_success_sd: Optional[float] = None
    avg_points_contributed: Optional[float] = None
    consistency_rating: Optional[float] = None

    @staticmethod
    def from_orm(obj):
        return TeamInfoSchema(
            rank=obj.rank,
            ranking_points=obj.ranking_points,
            tie=obj.tie,
            win=obj.win,
            lose=obj.lose,
            team_number=obj.team.number,
            competition=CompetitionSchema.from_orm(obj.competition),
            picture=str(obj.picture) if obj.picture else None,
            prescout_drivetrain=obj.prescout_drivetrain,
            prescout_hopper_size=obj.prescout_hopper_size,
            prescout_intake_type=obj.prescout_intake_type,
            prescout_rotate_yaw=obj.prescout_rotate_yaw,
            prescout_rotate_pitch=obj.prescout_rotate_pitch,
            prescout_self_reported_accuracy=obj.prescout_self_reported_accuracy,
            prescout_unload_time=obj.prescout_unload_time,
            prescout_range=obj.prescout_range,
            prescout_climber=obj.prescout_climber,
            prescout_climber_auto=obj.prescout_climber_auto,
            prescout_self_reported_auto_shoot=obj.prescout_self_reported_auto_shoot,
            prescout_additional_comments=obj.prescout_additional_comments,
            accuracy=obj.accuracy,
            avg_fuel_scored=obj.avg_fuel_scored,
            avg_shuttle=obj.avg_shuttle,
            avg_auto_fuel=obj.avg_auto_fuel,
            avg_climb_points=obj.avg_climb_points,
            avg_alliance_match_points=obj.avg_alliance_match_points,
            auto_success=obj.auto_success,
            auto_success_sd=obj.auto_success_sd,
            climb_success=obj.climb_success,
            climb_success_sd=obj.climb_success_sd,
            avg_points_contributed=obj.avg_points_contributed,
            consistency_rating=obj.consistency_rating,
        )


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
            "competition",
            "match_number",
            "set_number",
            "match_type",
            "has_played",
            "predicted_match_time",
            "start_match_time",
            "end_match_time",
            "blue_team_1",
            "blue_team_2",
            "blue_team_3",
            "red_team_1",
            "red_team_2",
            "red_team_3",
            "total_points",
            "total_blue_fuels",
            "total_red_fuels",
            "blue_1_auto_fuel",
            "blue_2_auto_fuel",
            "blue_3_auto_fuel",
            "red_1_auto_fuel",
            "red_2_auto_fuel",
            "red_3_auto_fuel",
            "blue_1_teleop_fuel",
            "blue_2_teleop_fuel",
            "blue_3_teleop_fuel",
            "red_1_teleop_fuel",
            "red_2_teleop_fuel",
            "red_3_teleop_fuel",
            "blue_1_fuel_scored",
            "blue_2_fuel_scored",
            "blue_3_fuel_scored",
            "red_1_fuel_scored",
            "red_2_fuel_scored",
            "red_3_fuel_scored",
            "blue_1_climb",
            "blue_2_climb",
            "blue_3_climb",
            "red_1_climb",
            "red_2_climb",
            "red_3_climb",
            "calculated_points",
            "blue_total_score",
            "red_total_score",
            "blue_ranking_points",
            "red_ranking_points",
            "winning_alliance",
            "blue_auto_points",
            "red_auto_points",
            "blue_teleop_points",
            "red_teleop_points",
            "blue_endgame_points",
            "red_endgame_points",
        ]


class UserSchema(ModelSchema):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name"]


class RobotActionSchema(ModelSchema):
    team: TeamSchema
    recorded_by: Optional[UserSchema] = None

    class Meta:
        model = RobotAction
        fields = [
            "id",
            "team",
            "action_type",
            "start_time",
            "end_time",
            "recorded_by",
            "notes",
            "created_at",
        ]


class RobotActionCreateSchema(Schema):
    action_type: str
    start_time: float
    end_time: float
    notes: Optional[str] = None
