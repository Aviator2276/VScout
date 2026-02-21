from decimal import Decimal
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
    ranking_points: Decimal
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
    prescout_range: Optional[str] = None
    prescout_driver_years: Optional[int] = None
    prescout_additional_comments: Optional[str] = None

    # Stats fields
    accuracy: Optional[Decimal] = None
    avg_fuel_scored: Optional[Decimal] = None
    avg_shuttle: Optional[Decimal] = None
    avg_auto_fuel: Optional[Decimal] = None
    avg_climb_points: Optional[Decimal] = None

    # Advanced stats
    avg_auto_fuel_sd: Optional[Decimal] = None
    avg_fuel_sd: Optional[Decimal] = None
    avg_climb_points_sd: Optional[Decimal] = None
    avg_points_contributed: Optional[Decimal] = None
    consistency_rating: Optional[Decimal] = None

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
            picture=obj.picture or None,
            prescout_drivetrain=obj.prescout_drivetrain,
            prescout_hopper_size=obj.prescout_hopper_size,
            prescout_intake_type=obj.prescout_intake_type,
            prescout_rotate_yaw=obj.prescout_rotate_yaw,
            prescout_rotate_pitch=obj.prescout_rotate_pitch,
            prescout_range=obj.prescout_range,
            prescout_driver_years=obj.prescout_driver_years,
            prescout_additional_comments=obj.prescout_additional_comments,
            accuracy=obj.accuracy,
            avg_fuel_scored=obj.avg_fuel_scored,
            avg_shuttle=obj.avg_shuttle,
            avg_auto_fuel=obj.avg_auto_fuel,
            avg_climb_points=obj.avg_climb_points,
            avg_auto_fuel_sd=obj.avg_auto_fuel_sd,
            avg_fuel_sd=obj.avg_fuel_sd,
            avg_climb_points_sd=obj.avg_climb_points_sd,
            avg_points_contributed=obj.avg_points_contributed,
            consistency_rating=obj.consistency_rating,
        )


class TeamInfoWithoutPictureSchema(Schema):
    """TeamInfo schema without picture field for bulk queries"""

    rank: Optional[int] = None
    ranking_points: Decimal
    tie: int
    win: int
    lose: int
    team_number: int
    competition: CompetitionSchema

    # Prescout fields (without picture)
    prescout_drivetrain: Optional[str] = None
    prescout_hopper_size: Optional[int] = None
    prescout_intake_type: Optional[str] = None
    prescout_rotate_yaw: bool
    prescout_rotate_pitch: bool
    prescout_range: Optional[str] = None
    prescout_driver_years: Optional[int] = None
    prescout_additional_comments: Optional[str] = None

    # Stats fields
    accuracy: Optional[Decimal] = None
    avg_fuel_scored: Optional[Decimal] = None
    avg_shuttle: Optional[Decimal] = None
    avg_auto_fuel: Optional[Decimal] = None
    avg_climb_points: Optional[Decimal] = None

    # Advanced stats
    avg_auto_fuel_sd: Optional[Decimal] = None
    avg_fuel_sd: Optional[Decimal] = None
    avg_climb_points_sd: Optional[Decimal] = None
    avg_points_contributed: Optional[Decimal] = None
    consistency_rating: Optional[Decimal] = None

    @staticmethod
    def from_orm(obj):
        return TeamInfoWithoutPictureSchema(
            rank=obj.rank,
            ranking_points=obj.ranking_points,
            tie=obj.tie,
            win=obj.win,
            lose=obj.lose,
            team_number=obj.team.number,
            competition=CompetitionSchema.from_orm(obj.competition),
            prescout_drivetrain=obj.prescout_drivetrain,
            prescout_hopper_size=obj.prescout_hopper_size,
            prescout_intake_type=obj.prescout_intake_type,
            prescout_rotate_yaw=obj.prescout_rotate_yaw,
            prescout_rotate_pitch=obj.prescout_rotate_pitch,
            prescout_range=obj.prescout_range,
            prescout_driver_years=obj.prescout_driver_years,
            prescout_additional_comments=obj.prescout_additional_comments,
            accuracy=obj.accuracy,
            avg_fuel_scored=obj.avg_fuel_scored,
            avg_shuttle=obj.avg_shuttle,
            avg_auto_fuel=obj.avg_auto_fuel,
            avg_climb_points=obj.avg_climb_points,
            avg_auto_fuel_sd=obj.avg_auto_fuel_sd,
            avg_fuel_sd=obj.avg_fuel_sd,
            avg_climb_points_sd=obj.avg_climb_points_sd,
            avg_points_contributed=obj.avg_points_contributed,
            consistency_rating=obj.consistency_rating,
        )


class PrescouttingUpdateSchema(Schema):
    prescout_drivetrain: Optional[str] = None
    prescout_hopper_size: Optional[int] = None
    prescout_intake_type: Optional[str] = None
    prescout_rotate_yaw: Optional[bool] = None
    prescout_rotate_pitch: Optional[bool] = None
    prescout_range: Optional[str] = None
    prescout_driver_years: Optional[int] = None
    prescout_additional_comments: Optional[str] = None


class MatchSchema(Schema):
    blue_team_1: TeamSchema
    blue_team_2: TeamSchema
    blue_team_3: TeamSchema
    red_team_1: TeamSchema
    red_team_2: TeamSchema
    red_team_3: TeamSchema
    competition: CompetitionSchema
    match_number: int
    set_number: int
    match_type: str
    has_played: bool
    predicted_match_time: int
    start_match_time: int
    end_match_time: int
    total_points: int
    total_blue_fuels: int
    total_red_fuels: int
    blue_1_auto_fuel: int
    blue_2_auto_fuel: int
    blue_3_auto_fuel: int
    red_1_auto_fuel: int
    red_2_auto_fuel: int
    red_3_auto_fuel: int
    blue_1_teleop_fuel: int
    blue_2_teleop_fuel: int
    blue_3_teleop_fuel: int
    red_1_teleop_fuel: int
    red_2_teleop_fuel: int
    red_3_teleop_fuel: int
    blue_1_fuel_scored: int
    blue_2_fuel_scored: int
    blue_3_fuel_scored: int
    red_1_fuel_scored: int
    red_2_fuel_scored: int
    red_3_fuel_scored: int
    blue_1_climb: Optional[str] = None
    blue_2_climb: Optional[str] = None
    blue_3_climb: Optional[str] = None
    red_1_climb: Optional[str] = None
    red_2_climb: Optional[str] = None
    red_3_climb: Optional[str] = None
    blue_1_auto_climb: bool
    blue_2_auto_climb: bool
    blue_3_auto_climb: bool
    red_1_auto_climb: bool
    red_2_auto_climb: bool
    red_3_auto_climb: bool
    calculated_points: int
    blue_total_score: int
    red_total_score: int
    blue_ranking_points: int
    red_ranking_points: int
    winning_alliance: Optional[str] = None
    blue_auto_points: int
    red_auto_points: int
    blue_teleop_points: int
    red_teleop_points: int
    blue_endgame_points: int
    red_endgame_points: int
    blue_penalties: int
    red_penalties: int
    video_available: bool

    @staticmethod
    def from_orm(obj):
        return MatchSchema(
            blue_team_1=TeamSchema.from_orm(obj.blue_team_1),
            blue_team_2=TeamSchema.from_orm(obj.blue_team_2),
            blue_team_3=TeamSchema.from_orm(obj.blue_team_3),
            red_team_1=TeamSchema.from_orm(obj.red_team_1),
            red_team_2=TeamSchema.from_orm(obj.red_team_2),
            red_team_3=TeamSchema.from_orm(obj.red_team_3),
            competition=CompetitionSchema.from_orm(obj.competition),
            match_number=obj.match_number,
            set_number=obj.set_number,
            match_type=obj.match_type,
            has_played=obj.has_played,
            predicted_match_time=obj.predicted_match_time,
            start_match_time=obj.start_match_time,
            end_match_time=obj.end_match_time,
            total_points=obj.total_points,
            total_blue_fuels=obj.total_blue_fuels,
            total_red_fuels=obj.total_red_fuels,
            blue_1_auto_fuel=obj.blue_1_auto_fuel,
            blue_2_auto_fuel=obj.blue_2_auto_fuel,
            blue_3_auto_fuel=obj.blue_3_auto_fuel,
            red_1_auto_fuel=obj.red_1_auto_fuel,
            red_2_auto_fuel=obj.red_2_auto_fuel,
            red_3_auto_fuel=obj.red_3_auto_fuel,
            blue_1_teleop_fuel=obj.blue_1_teleop_fuel,
            blue_2_teleop_fuel=obj.blue_2_teleop_fuel,
            blue_3_teleop_fuel=obj.blue_3_teleop_fuel,
            red_1_teleop_fuel=obj.red_1_teleop_fuel,
            red_2_teleop_fuel=obj.red_2_teleop_fuel,
            red_3_teleop_fuel=obj.red_3_teleop_fuel,
            blue_1_fuel_scored=obj.blue_1_fuel_scored,
            blue_2_fuel_scored=obj.blue_2_fuel_scored,
            blue_3_fuel_scored=obj.blue_3_fuel_scored,
            red_1_fuel_scored=obj.red_1_fuel_scored,
            red_2_fuel_scored=obj.red_2_fuel_scored,
            red_3_fuel_scored=obj.red_3_fuel_scored,
            blue_1_climb=obj.blue_1_climb,
            blue_2_climb=obj.blue_2_climb,
            blue_3_climb=obj.blue_3_climb,
            red_1_climb=obj.red_1_climb,
            red_2_climb=obj.red_2_climb,
            red_3_climb=obj.red_3_climb,
            blue_1_auto_climb=obj.blue_1_auto_climb,
            blue_2_auto_climb=obj.blue_2_auto_climb,
            blue_3_auto_climb=obj.blue_3_auto_climb,
            red_1_auto_climb=obj.red_1_auto_climb,
            red_2_auto_climb=obj.red_2_auto_climb,
            red_3_auto_climb=obj.red_3_auto_climb,
            calculated_points=obj.calculated_points,
            blue_total_score=obj.blue_total_score,
            red_total_score=obj.red_total_score,
            blue_ranking_points=obj.blue_ranking_points,
            red_ranking_points=obj.red_ranking_points,
            winning_alliance=obj.winning_alliance,
            blue_auto_points=obj.blue_auto_points,
            red_auto_points=obj.red_auto_points,
            blue_teleop_points=obj.blue_teleop_points,
            red_teleop_points=obj.red_teleop_points,
            blue_endgame_points=obj.blue_endgame_points,
            red_endgame_points=obj.red_endgame_points,
            blue_penalties=obj.blue_penalties,
            red_penalties=obj.red_penalties,
            video_available=obj.video_available,
        )


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
            "is_playoff",
            "fuel",
            "recorded_by",
            "notes",
            "created_at",
        ]


class RobotActionCreateSchema(Schema):
    action_type: str
    start_time: Decimal
    end_time: Decimal
    notes: Optional[str] = None


class RobotActionItemSchema(Schema):
    """Schema for individual action items in auto/tele arrays"""

    duration: int  # Duration in seconds
    action: str  # Action type (shoot, traverse, climb, etc.)
    fuel: int  # Number of fuel/game pieces


class BulkRobotActionsSchema(Schema):
    """Schema for bulk robot action submission"""

    team_number: int
    competition_code: str
    match_number: int
    is_playoff: bool = False
    notes: Optional[str] = None
    auto: list[RobotActionItemSchema]  # List of autonomous actions
    tele: list[RobotActionItemSchema]  # List of teleop actions
