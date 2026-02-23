"""
Setup scheduled tasks for VibeScout background jobs.

This module configures periodic tasks based on environment variables.
Tasks are automatically registered when Django starts up.
"""

import logging
import os

from django_q.models import Schedule

logger = logging.getLogger(__name__)


def setup_scheduled_tasks():
    """
    Setup all scheduled tasks based on environment variables.

    This function is called automatically when Django starts (via apps.py).
    It clears existing schedules and recreates them to ensure consistency.

    Environment Variables:
        TASK_CHECK_MATCHES_INTERVAL_MINUTES: How often to check for new matches (default: 5)
        COMPCODE: Competition code to monitor for new matches
        BACKGROUND_DEV: If true, tasks run immediately; if false, queued for qcluster
    """

    # Check if background tasks should be enabled
    background_enabled = os.getenv("BACKGROUND_TASKS_ENABLED", "true").lower() == "true"

    if not background_enabled:
        logger.info(
            "Background tasks disabled by BACKGROUND_TASKS_ENABLED env variable"
        )
        return

    # Clear existing schedules to prevent duplicates and ensure consistency
    existing_count = Schedule.objects.count()
    if existing_count > 0:
        Schedule.objects.all().delete()
        logger.info(f"Cleared {existing_count} existing scheduled task(s)")

    # Clear all queued, completed, and failed tasks on startup
    from django_q.models import Failure, OrmQ, Success

    queued = OrmQ.objects.all().delete()[0]
    success = Success.objects.all().delete()[0]
    failure = Failure.objects.all().delete()[0]
    logger.info(f"Cleared task history on startup: {queued} queued, {success} completed, {failure} failed")

    # Get schedule interval from environment (in minutes)
    check_matches_interval = int(os.getenv("TASK_CHECK_MATCHES_INTERVAL_MINUTES", "5"))

    # Get competition code
    competition_code = os.getenv("COMPCODE")

    if not competition_code:
        logger.warning("COMPCODE not set - match checking and video download tasks will not be scheduled")
    else:
        Schedule.objects.create(
            name="check_new_matches_periodic",
            func="backend.tasks.check_and_sync_new_matches",
            args=f'"{competition_code}"',
            schedule_type=Schedule.MINUTES,
            minutes=check_matches_interval,
            repeats=-1,
        )
        logger.info(
            f"Scheduled match checking task every {check_matches_interval} minutes for {competition_code}"
        )

        Schedule.objects.create(
            name="check_video_downloads_periodic",
            func="backend.tasks.check_and_download_videos",
            args=f'"{competition_code}"',
            schedule_type=Schedule.MINUTES,
            minutes=check_matches_interval,
            repeats=-1,
        )
        logger.info(
            f"Scheduled video download task every {check_matches_interval} minutes for {competition_code}"
        )

    logger.info("Scheduled tasks configured successfully")


def clear_all_scheduled_tasks():
    """
    Clear all scheduled tasks. Useful for testing or resetting.
    """
    deleted_count = Schedule.objects.all().delete()[0]
    logger.info(f"Cleared {deleted_count} scheduled tasks")
    return deleted_count
