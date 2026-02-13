import hashlib
import json
import os
from pathlib import Path
from typing import List

from django.conf import settings
from django.core.serializers import serialize
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from ninja import NinjaAPI

from .models import Competition, Match, RobotAction, Team, TeamInfo
from .schemas import (
    BulkRobotActionsSchema,
    CompetitionSchema,
    MatchSchema,
    PrescouttingUpdateSchema,
    RobotActionCreateSchema,
    RobotActionSchema,
    TeamInfoSchema,
    TeamInfoWithoutPictureSchema,
    TeamSchema,
)

api = NinjaAPI()


@api.get("/health")
def health(request):
    return {"status": "healthy"}


@api.get("/sync")
def sync(request):
    """
    Returns a hash of the entire database for sync detection.
    If the hash changes, the client knows the database has been updated.
    """
    # Serialize all relevant models
    data_to_hash = []

    # Get all data from each model, ordered consistently
    models_to_hash = [
        Team.objects.all().order_by("id"),
        Competition.objects.all().order_by("id"),
        TeamInfo.objects.all().order_by("id"),
        Match.objects.all().order_by("id"),
        RobotAction.objects.all().order_by("id"),
    ]

    for queryset in models_to_hash:
        serialized = serialize("json", queryset)
        data_to_hash.append(serialized)

    # Combine all serialized data
    combined_data = "".join(data_to_hash)

    # Generate SHA256 hash
    hash_object = hashlib.sha256(combined_data.encode())
    db_hash = hash_object.hexdigest()

    return {"hash": db_hash}


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

    # List of prescout fields that should not be overwritten if they already have data
    protected_fields = [
        "prescout_drivetrain",
        "prescout_hopper_size",
        "prescout_intake_type",
        "prescout_rotate_yaw",
        "prescout_rotate_pitch",
        "prescout_range",
        "prescout_driver_years",
        "prescout_additional_comments",
    ]

    for attr, value in payload.dict(exclude_unset=True).items():
        if attr in protected_fields:
            # Get the current value
            current_value = getattr(team_info, attr)

            # Only update if current value is empty/null/default
            # For strings: check if None or empty
            # For integers: check if None or 0
            # For booleans: check if False (default)
            is_empty = (
                current_value is None
                or current_value == ""
                or (isinstance(current_value, int) and current_value == 0)
                or (isinstance(current_value, bool) and current_value is False)
            )

            if is_empty:
                setattr(team_info, attr, value)
        else:
            # Non-protected fields can always be updated
            setattr(team_info, attr, value)

    team_info.save()
    return TeamInfoSchema.from_orm(team_info)


@api.get("/team-info/picture/sync")
def sync_team_picture(request, competition_code: str, team_number: int):
    """
    Get a hash of the robot picture for a team at a competition.

    This endpoint returns a hash to detect if the picture has changed,
    useful for sync detection without downloading the entire image.

    **Query Parameters:**
    - `competition_code`: Competition code (e.g., "2025gacmp")
    - `team_number`: Team number (e.g., 254)

    **Returns:**
    ```json
    {
        "hash": "abc123...",
        "has_picture": true
    }
    ```

    If no picture exists, returns:
    ```json
    {
        "hash": null,
        "has_picture": false
    }
    ```
    """
    competition = get_object_or_404(Competition, code=competition_code)
    team = get_object_or_404(Team, number=team_number)
    team_info = get_object_or_404(TeamInfo, team=team, competition=competition)

    if team_info.picture:
        # Generate SHA256 hash of the picture data
        hash_object = hashlib.sha256(team_info.picture.encode())
        picture_hash = hash_object.hexdigest()

        return {
            "hash": picture_hash,
            "has_picture": True,
        }
    else:
        return {
            "hash": None,
            "has_picture": False,
        }


@api.post("/team-info/picture")
def upload_team_picture(request, competition_code: str, team_number: int):
    """
    Upload a robot picture for a team at a competition.

    This endpoint accepts multipart/form-data with an image file for prescout documentation.
    The image is converted to a base64 data URI and stored directly in the database.

    **Request Format:**
    - Method: POST
    - Content-Type: multipart/form-data
    - Form field name: `picture`
    - Supported formats: JPEG, PNG

    **Query Parameters:**
    - `competition_code`: Competition code (e.g., "2025gacmp")
    - `team_number`: Team number (e.g., 254)

    **Behavior:**
    - Overwrites existing picture if one exists
    - Converts image to base64 data URI format
    - Stores data URI directly in database (no file system storage)
    - Returns the data URI for direct use in img src attributes

    **Example Response:**
    ```json
    {
        "success": true,
        "picture_url": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA..."
    }
    ```

    **Error Responses:**
    - 400: No picture file provided
    - 404: Competition, team, or team info not found
    """
    from ninja.errors import HttpError

    competition = get_object_or_404(Competition, code=competition_code)
    team = get_object_or_404(Team, number=team_number)
    team_info = get_object_or_404(TeamInfo, team=team, competition=competition)

    # Get the uploaded file
    if "picture" not in request.FILES:
        raise HttpError(400, "No picture file provided")

    picture_file = request.FILES["picture"]

    # Read the file and convert to base64
    import base64

    image_data = picture_file.read()
    base64_encoded = base64.b64encode(image_data).decode("utf-8")

    # Determine MIME type
    content_type = picture_file.content_type or "image/jpeg"

    # Create data URI
    data_uri = f"data:{content_type};base64,{base64_encoded}"

    # Save the base64 data URI (overwrites if exists)
    team_info.picture = data_uri
    team_info.save()

    return {
        "success": True,
    }


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


@api.get("/competitions/{code}/team-info", response=List[TeamInfoWithoutPictureSchema])
def get_competition_team_info(request, code: str):
    """
    Get all teams' full information for a competition including rankings, stats, and prescout data.
    Note: Pictures are excluded from this endpoint to reduce response size. Use the picture sync endpoint to check for pictures.
    """
    competition = get_object_or_404(Competition, code=code)
    queryset = (
        TeamInfo.objects.select_related("team", "competition")
        .filter(competition=competition)
        .order_by("rank")
    )
    return [TeamInfoWithoutPictureSchema.from_orm(obj) for obj in queryset]


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

    matches = (
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

    return [MatchSchema.from_orm(match) for match in matches]


@api.post("/robot-actions", response=RobotActionSchema)
def create_robot_action(
    request,
    competition_code: str,
    match_number: int,
    team_number: int,
    payload: RobotActionCreateSchema,
):
    from ninja.errors import HttpError

    competition = get_object_or_404(Competition, code=competition_code)
    match = get_object_or_404(Match, competition=competition, match_number=match_number)
    team = get_object_or_404(Team, number=team_number)

    # Get the user from the request if authenticated
    recorded_by = request.user if request.user.is_authenticated else None

    # Check if there are existing robot actions for this team and match
    existing_actions = RobotAction.objects.filter(match=match, team=team)

    if existing_actions.exists():
        # Get the first existing action to check who recorded it
        first_action = existing_actions.first()

        # If there's a different scouter (recorded_by user), don't allow the creation
        if first_action.recorded_by != recorded_by:
            raise HttpError(
                403,
                f"This team and match combination has already been scouted by another user. "
                f"Only the original scouter can add more actions.",
            )

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


@api.post("/robot-actions/bulk")
def bulk_create_robot_actions(request, payload: BulkRobotActionsSchema):
    """
    Bulk create robot actions from auto and teleop periods.

    This endpoint accepts a structured format with auto and tele action arrays,
    converts them to individual RobotAction records with proper start/end times.

    **Request Format:**
    ```json
    {
        "team_number": 254,
        "competition_code": "2025gacmp",
        "match_number": 1,
        "is_playoff": false,
        "notes": "General match notes",
        "auto": [
            {"duration": 2, "action": "shoot", "fuel": 2},
            {"duration": 10, "action": "traverse", "fuel": 0}
        ],
        "tele": [
            {"duration": 20, "action": "shoot", "fuel": 20},
            {"duration": 120, "action": "traverse", "fuel": 0}
        ]
    }
    ```

    **Behavior:**
    - Calculates start_time and end_time based on cumulative duration
    - Auto period starts at 0 seconds
    - Teleop period starts at 15 seconds (after auto)
    - Creates individual RobotAction records for each action
    - Prevents multiple scouts from recording the same team/match

    **Returns:**
    List of created RobotAction objects
    """
    from django.db import transaction
    from ninja.errors import HttpError

    competition = get_object_or_404(Competition, code=payload.competition_code)
    match = get_object_or_404(
        Match, competition=competition, match_number=payload.match_number
    )
    team = get_object_or_404(Team, number=payload.team_number)

    # Get the user from the request if authenticated
    recorded_by = request.user if request.user.is_authenticated else None

    # Check if there are existing robot actions for this team and match
    existing_actions = RobotAction.objects.filter(match=match, team=team)

    if existing_actions.exists():
        # Get the first existing action to check who recorded it
        first_action = existing_actions.first()

        # If there's a different scouter, don't allow the creation
        if first_action.recorded_by != recorded_by:
            raise HttpError(
                403,
                "This team and match combination has already been scouted by another user. "
                "Only the original scouter can add more actions.",
            )

        # Delete existing actions to replace with new bulk upload
        existing_actions.delete()

    created_actions = []

    with transaction.atomic():
        # Process auto actions (start at 0 seconds)
        current_time = 0.0
        for action_item in payload.auto:
            start_time = current_time
            end_time = current_time + action_item.duration

            robot_action = RobotAction.objects.create(
                match=match,
                team=team,
                action_type=action_item.action,
                start_time=start_time,
                end_time=end_time,
                is_playoff=payload.is_playoff,
                fuel=action_item.fuel,
                notes=payload.notes if payload.notes else None,
                recorded_by=recorded_by,
            )
            created_actions.append(robot_action)
            current_time = end_time

        # Process teleop actions (start at 15 seconds - after auto period)
        current_time = 15.0
        for action_item in payload.tele:
            start_time = current_time
            end_time = current_time + action_item.duration

            robot_action = RobotAction.objects.create(
                match=match,
                team=team,
                action_type=action_item.action,
                start_time=start_time,
                end_time=end_time,
                is_playoff=payload.is_playoff,
                fuel=action_item.fuel,
                notes=payload.notes if payload.notes else None,
                recorded_by=recorded_by,
            )
            created_actions.append(robot_action)
            current_time = end_time

    return created_actions


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
