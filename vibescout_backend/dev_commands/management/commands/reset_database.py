from django.core.management.base import BaseCommand
from django.db import connection

from backend.models import Competition, Match, RobotAction, Team, TeamInfo


class Command(BaseCommand):
    help = "Reset the database by deleting all data from all tables"

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-confirm",
            action="store_true",
            help="Skip confirmation prompt (use with caution!)",
        )

    def handle(self, *args, **options):
        # Ask for confirmation unless --no-confirm is passed
        if not options["no_confirm"]:
            self.stdout.write(
                self.style.WARNING(
                    "\n⚠️  WARNING: This will delete ALL data from the database!"
                )
            )
            self.stdout.write("This includes:")
            self.stdout.write("  - All teams")
            self.stdout.write("  - All competitions")
            self.stdout.write("  - All matches")
            self.stdout.write("  - All team info/stats")
            self.stdout.write("  - All robot actions")
            self.stdout.write("")
            confirm = input("Are you sure you want to continue? (yes/no): ")

            if confirm.lower() != "yes":
                self.stdout.write(self.style.ERROR("Aborted."))
                return

        self.stdout.write(self.style.WARNING("\n🗑️  Resetting database..."))

        # Delete all data in the correct order (respecting foreign keys)
        deleted_counts = {}

        # Delete in order of dependencies
        self.stdout.write("Deleting robot actions...")
        deleted_counts["RobotAction"] = RobotAction.objects.all().delete()[0]

        self.stdout.write("Deleting matches...")
        deleted_counts["Match"] = Match.objects.all().delete()[0]

        self.stdout.write("Deleting team info...")
        deleted_counts["TeamInfo"] = TeamInfo.objects.all().delete()[0]

        self.stdout.write("Deleting competitions...")
        deleted_counts["Competition"] = Competition.objects.all().delete()[0]

        self.stdout.write("Deleting teams...")
        deleted_counts["Team"] = Team.objects.all().delete()[0]

        # Reset auto-increment sequences
        self.stdout.write("\nResetting auto-increment sequences...")
        with connection.cursor() as cursor:
            tables = [
                "backend_team",
                "backend_competition",
                "backend_teaminfo",
                "backend_match",
                "backend_robotaction",
            ]
            for table in tables:
                try:
                    # SQLite syntax for resetting auto-increment
                    cursor.execute(f"DELETE FROM sqlite_sequence WHERE name='{table}'")
                except Exception as e:
                    # If not SQLite or other issue, just continue
                    self.stdout.write(
                        self.style.WARNING(f"Could not reset sequence for {table}: {e}")
                    )

        # Summary
        self.stdout.write(self.style.SUCCESS("\n✓ Database reset complete!"))
        self.stdout.write("\nDeleted records:")
        for model, count in deleted_counts.items():
            self.stdout.write(f"  {model}: {count}")

        self.stdout.write(
            self.style.SUCCESS(
                "\n💡 You can now run 'make comp-setup' to set up a new competition"
            )
        )
