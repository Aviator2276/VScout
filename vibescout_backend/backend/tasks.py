"""
Background tasks for VibeScout.

These tasks run periodically to sync data from The Blue Alliance API
and perform other maintenance operations.
"""

import logging
import os
from typing import Optional

from django.db.models import Max

logger = logging.getLogger(__name__)


def check_and_sync_new_matches(competition_code: Optional[str] = None) -> dict:
    """
    Check for new matches in TBA and sync them to the database.

    This task:
    1. Finds the lowest match number with has_played=False (unplayed match)
    2. Checks TBA to update that match with current data
    3. If all matches are played, checks for new matches sequentially

    Args:
        competition_code: Competition code (e.g., "2025gacmp").
                         If None, uses COMPCODE from environment.

    Returns:
        dict with status information about the sync
    """
    from .models import Competition, Match
    from .utils.match_utils import add_match_from_tba

    # Get competition code from env if not provided
    if not competition_code:
        competition_code = os.getenv("COMPCODE")
        if not competition_code:
            logger.error(
                "No competition code provided and COMPCODE env variable not set"
            )
            return {"success": False, "error": "No competition code available"}

    logger.info(f"Checking for new matches for competition: {competition_code}")

    # Get TBA API key
    tba_api_key = os.getenv("TBA_API_KEY")
    if not tba_api_key:
        logger.error("TBA_API_KEY not set in environment variables")
        return {"success": False, "error": "TBA_API_KEY not configured"}

    try:
        # Get the competition from database
        competition = Competition.objects.get(code=competition_code)
    except Competition.DoesNotExist:
        logger.error(f"Competition {competition_code} not found in database")
        return {"success": False, "error": f"Competition {competition_code} not found"}

    # Initialize TBA client
    from .utils.tba_api import TBAClient

    tba = TBAClient(tba_api_key)

    # Get the lowest match number with has_played=False, or the next match after the highest
    unplayed_match = (
        Match.objects.filter(
            competition=competition, match_type="qualification", has_played=False
        )
        .order_by("match_number")
        .first()
    )

    if unplayed_match:
        # Start checking from the first unplayed match
        start_match_number = unplayed_match.match_number
        logger.info(f"Found unplayed match {start_match_number}, will check from there")
    else:
        # All matches have been played, check for next match after highest
        latest_match = Match.objects.filter(
            competition=competition, match_type="qualification"
        ).aggregate(Max("match_number"))

        latest_match_number = latest_match["match_number__max"] or 0
        start_match_number = latest_match_number + 1
        logger.info(
            f"All matches played, latest is {latest_match_number}, checking for match {start_match_number}"
        )

    # Update only ONE match - the first unplayed match or next sequential match
    match_key = f"{competition_code}_qm{start_match_number}"

    try:
        # Use the existing add_match_from_tba utility
        # This will create OR update the match with latest data from TBA
        match = add_match_from_tba(
            tba_client=tba,
            competition_code=competition_code,
            match_number=start_match_number,
            match_type_code="qm",
            set_number=1,
            stdout=None,  # Don't print to stdout in background task
        )

        logger.info(
            f"Successfully updated match {start_match_number} (has_played: {match.has_played})"
        )

        return {
            "success": True,
            "message": f"Updated match {start_match_number}",
            "match_number": start_match_number,
            "match_key": match_key,
            "has_played": match.has_played,
            "blue_teams": [
                match.blue_team_1.number,
                match.blue_team_2.number,
                match.blue_team_3.number,
            ],
            "red_teams": [
                match.red_team_1.number,
                match.red_team_2.number,
                match.red_team_3.number,
            ],
        }

    except Exception as e:
        # Match doesn't exist or error occurred
        error_msg = str(e).lower()
        if "404" in error_msg or "not found" in error_msg:
            logger.info(f"Match {match_key} not found in TBA")
            return {
                "success": True,
                "message": f"Match {start_match_number} not found in TBA",
                "checked_match": start_match_number,
                "match_found": False,
            }
        else:
            logger.error(f"Error updating match {match_key}: {str(e)}")
            return {
                "success": False,
                "error": f"Error updating match {start_match_number}: {str(e)}",
                "match_number": start_match_number,
            }


def sync_all_competition_matches(competition_code: Optional[str] = None) -> dict:
    """
    Full sync of all matches for a competition from TBA.

    This is a more comprehensive sync that pulls all matches,
    useful for initial setup or recovery.

    Args:
        competition_code: Competition code (e.g., "2025gacmp").
                         If None, uses COMPCODE from environment.

    Returns:
        dict with status information about the sync
    """
    from .models import Competition
    from .utils.match_utils import import_match_from_dict

    # Get competition code from env if not provided
    if not competition_code:
        competition_code = os.getenv("COMPCODE")
        if not competition_code:
            logger.error(
                "No competition code provided and COMPCODE env variable not set"
            )
            return {"success": False, "error": "No competition code available"}

    logger.info(f"Starting full match sync for competition: {competition_code}")

    # Get TBA API key
    tba_api_key = os.getenv("TBA_API_KEY")
    if not tba_api_key:
        logger.error("TBA_API_KEY not set in environment variables")
        return {"success": False, "error": "TBA_API_KEY not configured"}

    try:
        # Get the competition from database
        competition = Competition.objects.get(code=competition_code)
    except Competition.DoesNotExist:
        logger.error(f"Competition {competition_code} not found in database")
        return {"success": False, "error": f"Competition {competition_code} not found"}

    # Initialize TBA client
    from .utils.tba_api import TBAClient

    tba = TBAClient(tba_api_key)

    try:
        # Fetch all matches for the event
        matches = tba.event_matches(competition_code)
        logger.info(f"Retrieved {len(matches)} matches from TBA")

        # Import each match
        matches_imported = 0
        for match_data in matches:
            try:
                import_match_from_dict(match_data, competition, stdout=None)
                matches_imported += 1
            except Exception as e:
                logger.error(f"Error importing match {match_data.get('key')}: {str(e)}")

        logger.info(f"Successfully imported {matches_imported} matches")

        return {
            "success": True,
            "message": f"Imported {matches_imported} of {len(matches)} matches",
            "total_matches": len(matches),
            "imported_matches": matches_imported,
        }

    except Exception as e:
        logger.error(f"Error syncing matches: {str(e)}")
        return {"success": False, "error": f"Error syncing matches: {str(e)}"}


def check_and_download_videos(competition_code: Optional[str] = None) -> dict:
    """
    Scheduled task: queue a download for the first played match without a video.
    Runs independently of match syncing. Only queues one download at a time.
    """
    from .models import Competition, Match

    if not competition_code:
        competition_code = os.getenv("COMPCODE")
        if not competition_code:
            return {"success": False, "error": "No competition code available"}

    try:
        competition = Competition.objects.get(code=competition_code)
    except Competition.DoesNotExist:
        return {"success": False, "error": f"Competition {competition_code} not found"}

    if not any([competition.stream_link_day_1, competition.stream_link_day_2, competition.stream_link_day_3]):
        return {"success": True, "message": "No stream links configured, skipping"}

    match = (
        Match.objects.filter(
            competition=competition,
            has_played=True,
            video_available=False,
            match_type="qualification",
        )
        .order_by("match_number")
        .first()
    )

    if not match:
        return {"success": True, "message": "No pending video downloads"}

    # Check if a download task is already queued for this competition
    from django_q.models import OrmQ

    task_prefix = f"download_video_{competition_code}"
    already_queued = any(task_prefix in (q.name() or "") for q in OrmQ.objects.all())

    if already_queued:
        logger.info(f"Download task already queued for {competition_code}, skipping")
        return {"success": True, "message": "Download already queued"}

    from django_q.tasks import async_task

    task_name = f"download_video_{competition_code}_match_{match.match_number}"
    logger.info(f"Queuing video download for match {match.match_number} ({competition_code})")
    async_task(
        "backend.tasks.download_match_video_task",
        match.pk,
        task_name=task_name,
    )
    return {"success": True, "message": f"Queued download for match {match.match_number}"}



def compute_stream_offsets(competition_code: Optional[str] = None) -> dict:
    """
    Compute stream offsets for a competition once match 1 has a start_match_time.

    Waits until the first played qualification match has a start_match_time, then
    computes offset = start_match_time - first_match_video_position and saves it.
    Once done, unschedules itself and schedules the normal match sync + video tasks.
    """
    from .models import Competition, Match

    if not competition_code:
        competition_code = os.getenv("COMPCODE")
        if not competition_code:
            return {"success": False, "error": "No competition code available"}

    try:
        competition = Competition.objects.get(code=competition_code)
    except Competition.DoesNotExist:
        return {"success": False, "error": f"Competition {competition_code} not found"}

    # Find the first played qualification match with a start_match_time
    first_match = (
        Match.objects.filter(
            competition=competition,
            match_type="qualification",
            has_played=True,
            start_match_time__gt=0,
        )
        .order_by("match_number")
        .first()
    )

    if not first_match:
        logger.info(
            f"No played matches with start_match_time yet for {competition_code}, will retry"
        )
        return {"success": True, "message": "Waiting for first match start_match_time"}

    # Determine which day the first match is on and compute offset
    updated = False
    if competition.first_match_video_position_day_1 > 0 and competition.offset_stream_time_to_unix_timestamp_day_1 == 0:
        offset = first_match.start_match_time - competition.first_match_video_position_day_1
        competition.offset_stream_time_to_unix_timestamp_day_1 = offset
        competition.save(update_fields=["offset_stream_time_to_unix_timestamp_day_1"])
        logger.info(f"Computed day 1 offset for {competition_code}: {offset}")
        updated = True

    if not updated:
        logger.info(f"No offset to compute for {competition_code} (position not set or offset already set)")
        return {"success": True, "message": "Nothing to compute"}

    # Unschedule this task and schedule the normal tasks
    from datetime import timedelta

    from django.utils import timezone
    from django_q.models import Schedule

    Schedule.objects.filter(name="compute_stream_offsets_periodic").delete()
    logger.info(f"Unscheduled compute_stream_offsets for {competition_code}")

    check_matches_interval = int(os.getenv("TASK_CHECK_MATCHES_INTERVAL_MINUTES", "5"))

    Schedule.objects.get_or_create(
        name="check_new_matches_periodic",
        defaults=dict(
            func="backend.tasks.check_and_sync_new_matches",
            args=f'"{competition_code}"',
            schedule_type=Schedule.MINUTES,
            minutes=check_matches_interval,
            repeats=-1,
        ),
    )
    Schedule.objects.get_or_create(
        name="check_video_downloads_periodic",
        defaults=dict(
            func="backend.tasks.check_and_download_videos",
            args=f'"{competition_code}"',
            schedule_type=Schedule.MINUTES,
            minutes=check_matches_interval,
            next_run=timezone.now() + timedelta(minutes=check_matches_interval / 2),
            repeats=-1,
        ),
    )
    logger.info(f"Scheduled normal match sync and video download tasks for {competition_code}")

    return {"success": True, "message": f"Offset computed and normal tasks scheduled"}


def download_match_video_task(match_id: int, buffer: int = 30) -> dict:
    """
    Background task to download a match video from YouTube stream.

    This task is queued automatically when a match's has_played status changes to True.

    Args:
        match_id: Primary key of the Match to download video for
        buffer: Buffer time in seconds before/after match (default: 30)

    Returns:
        dict with download status
    """
    from .models import Match
    from .utils.video_downloader import download_match_video

    try:
        match = Match.objects.get(pk=match_id)
    except Match.DoesNotExist:
        logger.error(f"Match with id {match_id} not found")
        return {"success": False, "error": f"Match {match_id} not found"}

    logger.info(
        f"Starting video download for match {match.match_number} "
        f"({match.competition.code})"
    )

    # Download the video
    success = download_match_video(match, buffer=buffer)

    if success:
        logger.info(
            f"Successfully downloaded video for match {match.match_number} "
            f"({match.competition.code}), video_available set to True"
        )
        return {
            "success": True,
            "message": f"Downloaded video for match {match.match_number}",
            "match_id": match_id,
            "match_number": match.match_number,
            "competition_code": match.competition.code,
            "video_available": True,
        }
    else:
        logger.warning(
            f"Failed to download video for match {match.match_number} "
            f"({match.competition.code})"
        )
        return {
            "success": False,
            "error": f"Video download failed for match {match.match_number}",
            "match_id": match_id,
            "match_number": match.match_number,
            "competition_code": match.competition.code,
            "video_available": False,
        }
