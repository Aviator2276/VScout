import logging
import os

from django.apps import AppConfig

logger = logging.getLogger(__name__)


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

        # Setup scheduled tasks
        try:
            from .schedule_setup import setup_scheduled_tasks

            setup_scheduled_tasks()
            logger.info("Background tasks initialized successfully")
        except Exception as e:
            logger.warning(f"Could not setup scheduled tasks: {e}")
            # Don't crash the app if task setup fails
