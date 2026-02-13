"""
Background tasks for VibeScout.

These tasks run periodically to sync data from The Blue Alliance API
and perform other maintenance operations.
"""

import logging
import os
from typing import Optional

import tbapy
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
    tba = tbapy.TBA(tba_api_key)

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
    tba = tbapy.TBA(tba_api_key)

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


def cleanup_old_tasks() -> dict:
    """
    Clean up old completed tasks from Django Q to prevent database bloat.

    Returns:
        dict with cleanup status
    """
    from datetime import timedelta

    from django.utils import timezone
    from django_q.models import Failure, Success

    # Keep tasks for the number of days specified in env (default 7 days)
    retention_days = int(os.getenv("TASK_RETENTION_DAYS", "7"))
    cutoff_date = timezone.now() - timedelta(days=retention_days)

    logger.info(f"Cleaning up tasks older than {retention_days} days ({cutoff_date})")

    # Delete old successful tasks
    success_deleted = Success.objects.filter(stopped__lt=cutoff_date).delete()

    # Delete old failed tasks (you might want to keep these longer)
    failure_deleted = Failure.objects.filter(stopped__lt=cutoff_date).delete()

    logger.info(
        f"Deleted {success_deleted[0]} successful tasks and {failure_deleted[0]} failed tasks"
    )

    return {
        "success": True,
        "message": f"Cleaned up tasks older than {retention_days} days",
        "successful_tasks_deleted": success_deleted[0],
        "failed_tasks_deleted": failure_deleted[0],
    }
