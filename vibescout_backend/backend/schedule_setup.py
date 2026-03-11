"""
Setup scheduled tasks for VibeScout background jobs.

This module configures periodic tasks based on environment variables.
Tasks are automatically registered when Django starts up.
One set of schedules is created per competition found in the database.
"""

import logging
from datetime import timedelta

from django.utils import timezone
from django_q.models import Schedule

logger = logging.getLogger(__name__)


def setup_scheduled_tasks():
    """
    Setup all scheduled tasks based on competitions in the database.

    This function is called automatically when Django starts (via apps.py).
    It clears existing schedules and recreates them to ensure consistency.
    One match-sync + video-download schedule pair is created per competition.

    """

    # Clear existing schedules to prevent duplicates
    existing_count = Schedule.objects.count()
    if existing_count > 0:
        Schedule.objects.all().delete()
        logger.info(f"Cleared {existing_count} existing scheduled task(s)")

    # Clear queued/completed/failed tasks on startup
    from django_q.models import Failure, OrmQ, Success

    queued = OrmQ.objects.all().delete()[0]
    success = Success.objects.all().delete()[0]
    failure = Failure.objects.all().delete()[0]
    logger.info(f"Cleared task history on startup: {queued} queued, {success} completed, {failure} failed")

    check_matches_interval = 1  # minutes

    from backend.models import Competition, Match

    competitions = list(Competition.objects.all())

    if not competitions:
        logger.warning("No competitions in database — no tasks scheduled")
        return

    for i, competition in enumerate(competitions):
        code = competition.code

        # Stagger start times slightly so competitions don't all run at once
        offset_minutes = (i * check_matches_interval) / max(len(competitions), 1)

        try:
            first_match = (
                Match.objects.filter(
                    competition=competition,
                    match_type="qualification",
                )
                .order_by("match_number")
                .first()
            )
            first_match_has_video = first_match and first_match.video_available
        except Exception:
            first_match_has_video = False

        if not first_match_has_video:
            Schedule.objects.create(
                name=f"compute_stream_offsets_{code}",
                func="backend.tasks.compute_stream_offsets",
                args=f'"{code}"',
                schedule_type=Schedule.MINUTES,
                minutes=check_matches_interval,
                repeats=-1,
            )
            logger.info(f"Scheduled compute_stream_offsets for {code} every {check_matches_interval}m")

            Schedule.objects.create(
                name=f"check_new_matches_{code}",
                func="backend.tasks.check_and_sync_new_matches",
                args=f'"{code}"',
                schedule_type=Schedule.MINUTES,
                minutes=check_matches_interval,
                next_run=timezone.now() + timedelta(minutes=check_matches_interval / 2),
                repeats=-1,
            )
            logger.info(f"Scheduled match sync for {code} every {check_matches_interval}m")
        else:
            Schedule.objects.create(
                name=f"check_new_matches_{code}",
                func="backend.tasks.check_and_sync_new_matches",
                args=f'"{code}"',
                schedule_type=Schedule.MINUTES,
                minutes=check_matches_interval,
                next_run=timezone.now() + timedelta(minutes=offset_minutes),
                repeats=-1,
            )
            logger.info(f"Scheduled match sync for {code} every {check_matches_interval}m")

            Schedule.objects.create(
                name=f"check_video_downloads_{code}",
                func="backend.tasks.check_and_download_videos",
                args=f'"{code}"',
                schedule_type=Schedule.MINUTES,
                minutes=check_matches_interval,
                next_run=timezone.now() + timedelta(minutes=offset_minutes + check_matches_interval / 2),
                repeats=-1,
            )
            logger.info(f"Scheduled video downloads for {code} every {check_matches_interval}m")

    logger.info(f"Scheduled tasks configured for {len(competitions)} competition(s)")


def clear_all_scheduled_tasks():
    """
    Clear all scheduled tasks. Useful for testing or resetting.
    """
    deleted_count = Schedule.objects.all().delete()[0]
    logger.info(f"Cleared {deleted_count} scheduled tasks")
    return deleted_count
