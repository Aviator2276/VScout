import os
from pathlib import Path
from typing import List

from django.conf import settings
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from ninja import NinjaAPI

from .models import Competition, Match, RobotAction, Team, TeamInfo
from .schemas import (
    CompetitionSchema,
    MatchSchema,
    PrescouttingUpdateSchema,
    RobotActionCreateSchema,
    RobotActionSchema,
    TeamInfoSchema,
    TeamSchema,
)

api = NinjaAPI()


@api.get("/health")
def health(request):
    return {"status": "healthy"}


@api.get("/competitions", response=List[CompetitionSchema])
def list_competitions(request):
    return Competition.objects.all()


@api.get("/competitions/{code}", response=CompetitionSchema)
def get_competition(request, code: str):
    return get_object_or_404(Competition, code=code)


@api.get("/team-info", response=List[TeamInfoSchema])
def list_team_info(request, competition_code: str, team_number: int = None):
    competition = get_object_or_404(Competition, code=competition_code)
    queryset = TeamInfo.objects.select_related("team", "competition").filter(
        competition=competition
    )
    if team_number:
        team = get_object_or_404(Team, number=team_number)
        queryset = queryset.filter(team=team)
    return [TeamInfoSchema.from_orm(obj) for obj in queryset]


@api.patch("/team-info/prescouting", response=TeamInfoSchema)
def update_prescouting(
    request, competition_code: str, team_number: int, payload: PrescouttingUpdateSchema
):
    competition = get_object_or_404(Competition, code=competition_code)
    team = get_object_or_404(Team, number=team_number)
    team_info = get_object_or_404(TeamInfo, team=team, competition=competition)
    for attr, value in payload.dict(exclude_unset=True).items():
        setattr(team_info, attr, value)
    team_info.save()
    return TeamInfoSchema.from_orm(team_info)


@api.get("/teams/{team_number}/competitions", response=List[CompetitionSchema])
def get_team_competitions(request, team_number: int):
    team = get_object_or_404(Team, number=team_number)
    return Competition.objects.filter(results__team=team).distinct()


@api.get("/competitions/{code}/teams", response=List[TeamSchema])
def get_competition_teams(request, code: str):
    competition = get_object_or_404(Competition, code=code)
    return (
        Team.objects.filter(results__competition=competition)
        .distinct()
        .order_by("number")
    )


@api.get("/competitions/{code}/matches", response=List[MatchSchema])
def get_competition_matches_by_code(request, code: str):
    from django.db.models import Case, IntegerField, When

    competition = get_object_or_404(Competition, code=code)

    match_type_order = Case(
        When(match_type="qualification", then=1),
        When(match_type="quarterfinal", then=2),
        When(match_type="semifinal", then=3),
        When(match_type="final", then=4),
        default=5,
        output_field=IntegerField(),
    )

    return (
        Match.objects.select_related(
            "competition",
            "blue_team_1",
            "blue_team_2",
            "blue_team_3",
            "red_team_1",
            "red_team_2",
            "red_team_3",
        )
        .filter(competition=competition)
        .order_by(match_type_order, "match_number")
    )


@api.post("/robot-actions", response=RobotActionSchema)
def create_robot_action(
    request,
    competition_code: str,
    match_number: int,
    team_number: int,
    payload: RobotActionCreateSchema,
):
    competition = get_object_or_404(Competition, code=competition_code)
    match = get_object_or_404(Match, competition=competition, match_number=match_number)
    team = get_object_or_404(Team, number=team_number)

    # Get the user from the request if authenticated
    recorded_by = request.user if request.user.is_authenticated else None

    robot_action = RobotAction.objects.create(
        match=match,
        team=team,
        action_type=payload.action_type,
        start_time=payload.start_time,
        end_time=payload.end_time,
        notes=payload.notes,
        recorded_by=recorded_by,
    )
    return robot_action


@api.get("/robot-actions", response=List[RobotActionSchema])
def list_robot_actions(
    request, competition_code: str, match_number: int, team_number: int = None
):
    competition = get_object_or_404(Competition, code=competition_code)
    match = get_object_or_404(Match, competition=competition, match_number=match_number)

    queryset = RobotAction.objects.select_related("team", "recorded_by").filter(
        match=match
    )
    if team_number:
        team = get_object_or_404(Team, number=team_number)
        queryset = queryset.filter(team=team)

    return queryset


@api.get("/scary-api")
def scary_api(request):
    return {"scary": "67"}


@api.get("/competitions/{competition_code}/matches/{match_number}/video")
def get_match_video(request, competition_code: str, match_number: int):
    """
    Get the video file for a specific match.
    Searches for the video file matching the pattern: match_qualification_{match_number}_day*.mp4

    Args:
        competition_code: The competition code (e.g., "2025gacmp")
        match_number: The match number

    Returns:
        FileResponse: The video file stream
    """
    # Verify the competition exists
    get_object_or_404(Competition, code=competition_code)

    # Construct the video directory path
    video_dir = (
        Path(__file__).resolve().parent.parent.parent
        / "match_videos"
        / competition_code
    )

    # Check if the directory exists
    if not video_dir.exists():
        raise Http404(f"No videos found for competition: {competition_code}")

    # Search for video files matching the pattern
    # Pattern: match_qualification_{match_number}_day*.mp4
    video_pattern = f"match_qualification_{match_number}_day*.mp4"
    matching_videos = list(video_dir.glob(video_pattern))

    if not matching_videos:
        raise Http404(f"Video not found for match {match_number}")

    # Use the first matching video (in case there are multiple days)
    video_path = matching_videos[0]

    # Return the video file as a streaming response
    response = FileResponse(open(video_path, "rb"), content_type="video/mp4")
    response["Content-Disposition"] = f'inline; filename="{video_path.name}"'
    return response
