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
        TASK_CLEANUP_INTERVAL_MINUTES: How often to clean up old tasks (default: 1440 = 24h)
        TASK_RETENTION_DAYS: How many days to keep completed tasks (default: 7)
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

    # Get schedule intervals from environment (in minutes)
    check_matches_interval = int(os.getenv("TASK_CHECK_MATCHES_INTERVAL_MINUTES", "5"))
    cleanup_interval = int(
        os.getenv("TASK_CLEANUP_INTERVAL_MINUTES", "1440")
    )  # 24 hours default

    # Get competition code
    competition_code = os.getenv("COMPCODE")

    if not competition_code:
        logger.warning("COMPCODE not set - match checking task will not be scheduled")
    else:
        # Schedule periodic task to check for new matches
        # Note: args must be a string that can be parsed as a Python literal
        Schedule.objects.create(
            name="check_new_matches_periodic",
            func="backend.tasks.check_and_sync_new_matches",
            args=f'"{competition_code}"',  # Properly quote the string argument
            schedule_type=Schedule.MINUTES,
            minutes=check_matches_interval,
            repeats=-1,  # Repeat indefinitely
        )
        logger.info(
            f"Scheduled match checking task every {check_matches_interval} minutes for {competition_code}"
        )

    # Schedule periodic cleanup task
    Schedule.objects.create(
        name="cleanup_old_tasks_periodic",
        func="backend.tasks.cleanup_old_tasks",
        schedule_type=Schedule.MINUTES,
        minutes=cleanup_interval,
        repeats=-1,  # Repeat indefinitely
    )
    logger.info(f"Scheduled cleanup task every {cleanup_interval} minutes")

    logger.info("All scheduled tasks configured successfully")


def clear_all_scheduled_tasks():
    """
    Clear all scheduled tasks. Useful for testing or resetting.
    """
    deleted_count = Schedule.objects.all().delete()[0]
    logger.info(f"Cleared {deleted_count} scheduled tasks")
    return deleted_count
