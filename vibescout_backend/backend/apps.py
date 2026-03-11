import logging
import os

from django.apps import AppConfig
from django.db.backends.signals import connection_created

logger = logging.getLogger(__name__)


def _set_sqlite_wal(sender, connection, **kwargs):
    """Enable WAL mode and set busy timeout for all SQLite connections."""
    if connection.vendor == "sqlite":
        connection.cursor().execute("PRAGMA journal_mode=WAL;")
        connection.cursor().execute("PRAGMA synchronous=NORMAL;")
        connection.cursor().execute("PRAGMA busy_timeout=20000;")


connection_created.connect(_set_sqlite_wal)


class BackendConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "backend"

    def ready(self):
        """
        Called when Django starts.
        Initialize scheduled background tasks here.
        """
        # Only run in the main process, not in the reloader process
        # RUN_MAIN is set by Django's autoreloader - only run when it's 'true'
        if os.environ.get("RUN_MAIN") != "true":
            return

        # Skip during migrations
        from django.db import connection
        from django.db.migrations.executor import MigrationExecutor

        try:
            executor = MigrationExecutor(connection)
            # Check if there are pending migrations
            if executor.migration_plan(executor.loader.graph.leaf_nodes()):
                logger.info("Pending migrations detected - skipping task setup")
                return
        except Exception as e:
            logger.debug(f"Could not check migrations: {e}")
            # Continue anyway - this is just a safety check

        # Clean up any leftover .part files from interrupted downloads
        try:
            from pathlib import Path
            match_videos_dir = Path(__file__).resolve().parent.parent / "match_videos"
            for part_file in match_videos_dir.rglob("*.part"):
                part_file.unlink()
                logger.info(f"Cleaned up leftover download: {part_file.name}")
        except Exception as e:
            logger.warning(f"Could not clean up .part files: {e}")

        # Setup scheduled tasks
        try:
            from .schedule_setup import setup_scheduled_tasks

            setup_scheduled_tasks()
            logger.info("Background tasks initialized successfully")
        except Exception as e:
            logger.warning(f"Could not setup scheduled tasks: {e}")
            # Don't crash the app if task setup fails
