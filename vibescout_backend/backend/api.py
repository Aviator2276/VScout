import hashlib
import json
import os
from pathlib import Path
from typing import List

from django.conf import settings
from django.core.serializers import serialize
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from ninja import NinjaAPI, Schema

from .models import Competition, Match, RobotAction, Team, TeamComment, TeamInfo
from .schemas import (
    BulkRobotActionsResponseSchema,
    BulkRobotActionsSchema,
    CompetitionSchema,
    MatchRobotActionsResponseSchema,
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


@api.get("/team-info", response=List[TeamInfoWithoutPictureSchema])
def list_team_info(request, competition_code: str, team_number: int = None):
    competition = get_object_or_404(Competition, code=competition_code)
    queryset = TeamInfo.objects.select_related("team", "competition").filter(
        competition=competition
    )
    if team_number:
        team = get_object_or_404(Team, number=team_number)
        queryset = queryset.filter(team=team)
    return [TeamInfoWithoutPictureSchema.from_orm(obj) for obj in queryset]


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
        "prescout_shooter_type",
        "prescout_trench_travel",
        "prescout_trench_travel_preference",
        "prescout_has_auto",
        "prescout_has_disruption_auto",
        "prescout_auto_starting_pose",
        "prescout_auto_depot",
        "prescout_auto_outpost",
        "prescout_auto_crosses_center_line",
        "prescout_auto_climb_level",
        "prescout_auto_center_sweeps",
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


@api.get("/team-info/picture")
def get_team_picture(request, competition_code: str, team_number: int):
    """
    Get the robot picture for a team at a competition.

    Returns the base64-encoded picture data URI that can be used directly in img src attributes.

    **Query Parameters:**
    - `competition_code`: Competition code (e.g., "2025gacmp")
    - `team_number`: Team number (e.g., 254)

    **Returns:**
    ```json
    {
        "picture": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA..."
    }
    ```

    If no picture exists, returns:
    ```json
    {
        "picture": null
    }
    ```
    """
    competition = get_object_or_404(Competition, code=competition_code)
    team = get_object_or_404(Team, number=team_number)
    team_info = get_object_or_404(TeamInfo, team=team, competition=competition)

    return {
        "picture": team_info.picture if team_info.picture else None,
    }


@api.get("/team-info/picture/sync")
def sync_team_picture(request, competition_code: str):
    """
    Get hashes of all robot pictures for a competition.

    This endpoint returns hashes for all teams at a competition to detect if pictures have changed,
    useful for sync detection without downloading the entire images.

    **Query Parameters:**
    - `competition_code`: Competition code (e.g., "2025gacmp")

    **Returns:**
    ```json
    {
        "teams": {
            "254": {
                "hash": "abc123...",
                "has_picture": true
            },
            "1323": {
                "hash": "def456...",
                "has_picture": true
            },
            "9999": {
                "hash": null,
                "has_picture": false
            }
        }
    }
    ```
    """
    competition = get_object_or_404(Competition, code=competition_code)

    # Get all team info for this competition
    team_infos = TeamInfo.objects.select_related("team").filter(competition=competition)

    teams_data = {}
    for team_info in team_infos:
        team_number = str(team_info.team.number)

        if team_info.picture:
            # Generate SHA256 hash of the picture data
            hash_object = hashlib.sha256(team_info.picture.encode())
            picture_hash = hash_object.hexdigest()

            teams_data[team_number] = {
                "hash": picture_hash,
                "has_picture": True,
            }
        else:
            teams_data[team_number] = {
                "hash": None,
                "has_picture": False,
            }

    return {"teams": teams_data}


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


@api.post("/robot-actions/bulk", response=list[RobotActionSchema])
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
            {"duration": 2, "action": "shoot"},
            {"duration": 10, "action": "traverse"}
        ],
        "tele": [
            {"duration": 20, "action": "shoot"},
            {"duration": 120, "action": "traverse"}
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
                fuel=0,
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
                fuel=0,
                notes=payload.notes if payload.notes else None,
                recorded_by=recorded_by,
            )
            created_actions.append(robot_action)
            current_time = end_time

    # Queue fuel attribution in case this completes an alliance
    if match.fuel_timeline is not None:
        from django_q.tasks import async_task
        async_task(
            "backend.tasks.attribute_fuel_to_robots_task",
            match.pk,
            task_name=f"fuel_attribution_{match.competition.code}_match_{match.match_number}",
        )

    return created_actions


@api.get("/robot-actions/bulk", response=MatchRobotActionsResponseSchema)
def get_bulk_robot_actions(
    request, competition_code: str, match_number: int
):
    """
    Returns robot action durations and fuel counts for all teams in a match.

    Fuel counts come from the match's official TBA data (not scouter input).
    Actions are split into auto (start_time < 15) and tele (start_time >= 15).
    """
    competition = get_object_or_404(Competition, code=competition_code)
    match = get_object_or_404(Match, competition=competition, match_number=match_number)

    # All actions for this match, ordered by start_time
    all_actions = RobotAction.objects.filter(match=match).order_by("start_time")

    # Group actions by team id
    actions_by_team = {}
    for action in all_actions:
        actions_by_team.setdefault(action.team_id, []).append(action)

    # Map positions to team ids and fuel field names
    positions = [
        ("blue_1", match.blue_team_1_id, match.blue_team_1),
        ("blue_2", match.blue_team_2_id, match.blue_team_2),
        ("blue_3", match.blue_team_3_id, match.blue_team_3),
        ("red_1", match.red_team_1_id, match.red_team_1),
        ("red_2", match.red_team_2_id, match.red_team_2),
        ("red_3", match.red_team_3_id, match.red_team_3),
    ]

    teams_result = []
    for position, team_id, team in positions:
        if not team_id:
            continue

        actions = actions_by_team.get(team_id, [])

        auto_fuel = getattr(match, f"{position}_auto_fuel", 0) or 0
        tele_fuel = getattr(match, f"{position}_teleop_fuel", 0) or 0

        # Calculate total shooting duration in each period to distribute fuel proportionally
        auto_shoot_duration = sum(
            float(a.end_time - a.start_time)
            for a in actions
            if a.action_type == "shooting" and a.start_time < 15
        )
        tele_shoot_duration = sum(
            float(a.end_time - a.start_time)
            for a in actions
            if a.action_type == "shooting" and a.start_time >= 15
        )

        auto_actions = []
        tele_actions = []
        for action in actions:
            duration = float(action.end_time - action.start_time)
            item = {"duration": duration, "action": action.action_type}

            if action.action_type == "shooting":
                if action.start_time < 15:
                    item["fuel"] = round(auto_fuel * (duration / auto_shoot_duration)) if auto_shoot_duration else 0
                else:
                    item["fuel"] = round(tele_fuel * (duration / tele_shoot_duration)) if tele_shoot_duration else 0

            if action.start_time < 15:
                auto_actions.append(item)
            else:
                tele_actions.append(item)

        # Get notes from the first action that has notes for this team
        team_notes = next((a.notes for a in actions if a.notes), None)

        teams_result.append({
            "team_number": team.number,
            "auto": auto_actions,
            "tele": tele_actions,
            "auto_fuel": auto_fuel,
            "tele_fuel": tele_fuel,
            "notes": team_notes,
        })

    return {"teams": teams_result}


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
        Path(__file__).resolve().parent.parent
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


# ---------------------------------------------------------------------------
# Offsite processing endpoints
# ---------------------------------------------------------------------------

def _check_offsite_key(request):
    """Returns True if the request carries a valid OFFSITE_API_KEY."""
    import os
    expected = os.getenv("OFFSITE_API_KEY")
    if not expected:
        return False
    return request.headers.get("X-Offsite-Key") == expected


@api.get("/offsite/pending")
def offsite_pending(request):
    """
    Return matches that need video/OCR processing.
    Requires X-Offsite-Key header matching OFFSITE_API_KEY env var.
    """
    from ninja.errors import HttpError
    if not _check_offsite_key(request):
        raise HttpError(403, "Invalid or missing offsite API key")

    matches = Match.objects.filter(
        has_played=True,
        skip_processing=False,
        fuel_timeline__isnull=True,
    ).select_related("competition").order_by("competition__code", "match_number")

    # Cache first match start time per competition to avoid repeated queries
    first_match_times = {}

    result = []
    for match in matches:
        comp = match.competition
        if comp.code not in first_match_times:
            first = (
                Match.objects.filter(competition=comp, start_match_time__gt=0)
                .order_by("start_match_time")
                .values_list("start_match_time", flat=True)
                .first()
            )
            first_match_times[comp.code] = first or 0
        result.append({
            "match_id": match.pk,
            "competition_code": comp.code,
            "match_number": match.match_number,
            "match_type": match.match_type,
            "set_number": match.set_number,
            "start_match_time": match.start_match_time,
            "first_match_start_time": first_match_times[comp.code],
            "stream_link_day_1": comp.stream_link_day_1,
            "stream_link_day_2": comp.stream_link_day_2,
            "stream_link_day_3": comp.stream_link_day_3,
            "offset_day_1": comp.offset_stream_time_to_unix_timestamp_day_1,
            "offset_day_2": comp.offset_stream_time_to_unix_timestamp_day_2,
            "offset_day_3": comp.offset_stream_time_to_unix_timestamp_day_3,
            "first_match_pos_day_1": comp.first_match_video_position_day_1,
            "first_match_pos_day_2": comp.first_match_video_position_day_2,
            "first_match_pos_day_3": comp.first_match_video_position_day_3,
        })
    return result


@api.get("/offsite/all-matches")
def offsite_all_matches(request):
    """
    Return all played matches for offsite processing (including already-processed ones).
    Used with --force flag to reprocess/override existing data.
    Requires X-Offsite-Key header.
    """
    from ninja.errors import HttpError
    if not _check_offsite_key(request):
        raise HttpError(403, "Invalid or missing offsite API key")

    matches = Match.objects.filter(
        has_played=True,
        skip_processing=False,
    ).select_related("competition").order_by("competition__code", "match_number")

    first_match_times = {}
    result = []
    for match in matches:
        comp = match.competition
        if comp.code not in first_match_times:
            first = (
                Match.objects.filter(competition=comp, start_match_time__gt=0)
                .order_by("start_match_time")
                .values_list("start_match_time", flat=True)
                .first()
            )
            first_match_times[comp.code] = first or 0
        result.append({
            "match_id": match.pk,
            "competition_code": comp.code,
            "match_number": match.match_number,
            "match_type": match.match_type,
            "set_number": match.set_number,
            "start_match_time": match.start_match_time,
            "first_match_start_time": first_match_times[comp.code],
            "stream_link_day_1": comp.stream_link_day_1,
            "stream_link_day_2": comp.stream_link_day_2,
            "stream_link_day_3": comp.stream_link_day_3,
            "offset_day_1": comp.offset_stream_time_to_unix_timestamp_day_1,
            "offset_day_2": comp.offset_stream_time_to_unix_timestamp_day_2,
            "offset_day_3": comp.offset_stream_time_to_unix_timestamp_day_3,
            "first_match_pos_day_1": comp.first_match_video_position_day_1,
            "first_match_pos_day_2": comp.first_match_video_position_day_2,
            "first_match_pos_day_3": comp.first_match_video_position_day_3,
        })
    return result


class _OffsiteSubmitBody(Schema):
    fuel_timeline: dict


@api.post("/offsite/submit/{match_id}")
def offsite_submit(request, match_id: int, payload: _OffsiteSubmitBody):
    """
    Submit processed fuel_timeline for a match from the offsite machine.
    Expects: {"fuel_timeline": {"blue": [...], "red": [...]}}
    Requires X-Offsite-Key header.
    """
    from ninja.errors import HttpError
    if not _check_offsite_key(request):
        raise HttpError(403, "Invalid or missing offsite API key")

    match = get_object_or_404(Match, pk=match_id)

    fuel_timeline = payload.fuel_timeline
    if not fuel_timeline:
        raise HttpError(400, "fuel_timeline is required")

    match.fuel_timeline = fuel_timeline
    match.video_clipped = True
    match.save(update_fields=["fuel_timeline", "video_clipped"])

    # Queue fuel attribution
    from django_q.tasks import async_task
    async_task(
        "backend.tasks.attribute_fuel_to_robots_task",
        match.pk,
        task_name=f"fuel_attribution_{match.competition.code}_match_{match.match_number}",
    )

    return {"success": True, "match_id": match_id, "match_number": match.match_number}


@api.post("/offsite/upload-video/{match_id}")
def offsite_upload_video(request, match_id: int):
    """
    Upload a clipped match video from the offsite machine.
    Saves to match_videos/{competition_code}/match_{type}_{number}_day1.mp4
    Requires X-Offsite-Key header.
    """
    from ninja.errors import HttpError
    if not _check_offsite_key(request):
        raise HttpError(403, "Invalid or missing offsite API key")

    match = get_object_or_404(Match, pk=match_id)

    if "video" not in request.FILES:
        raise HttpError(400, "No video file provided")

    video_file = request.FILES["video"]

    video_dir = (
        Path(__file__).resolve().parent.parent
        / "match_videos"
        / match.competition.code
    )
    video_dir.mkdir(parents=True, exist_ok=True)

    filename = f"match_{match.match_type}_{match.match_number}_day1.mp4"
    video_path = video_dir / filename

    with open(video_path, "wb") as f:
        for chunk in video_file.chunks():
            f.write(chunk)

    match.video_available = True
    match.save(update_fields=["video_available"])

    return {"success": True, "match_id": match_id, "filename": filename}


# --- Team Comments ---

class TeamCommentSchema(Schema):
    id: int
    team_number: int
    comment: str
    created_at: int

    @staticmethod
    def from_orm(obj):
        return TeamCommentSchema(
            id=obj.pk,
            team_number=obj.team.number,
            comment=obj.comment,
            created_at=int(obj.created_at.timestamp()),
        )


class TeamCommentCreateSchema(Schema):
    comment: str


@api.get("/teams/{team_number}/comments", response=List[TeamCommentSchema])
def get_team_comments(request, team_number: int):
    team = get_object_or_404(Team, number=team_number)
    return [TeamCommentSchema.from_orm(c) for c in TeamComment.objects.filter(team=team)]


@api.post("/teams/{team_number}/comments", response=TeamCommentSchema)
def create_team_comment(request, team_number: int, payload: TeamCommentCreateSchema):
    team = get_object_or_404(Team, number=team_number)
    comment = TeamComment.objects.create(team=team, comment=payload.comment)
    return TeamCommentSchema.from_orm(comment)


@api.delete("/teams/{team_number}/comments/{comment_id}")
def delete_team_comment(request, team_number: int, comment_id: int):
    team = get_object_or_404(Team, number=team_number)
    comment = get_object_or_404(TeamComment, pk=comment_id, team=team)
    comment.delete()
    return {"success": True}
