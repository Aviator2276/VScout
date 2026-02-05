import os
from pathlib import Path

import tbapy
from django.core.management.base import BaseCommand
from django.db import transaction
from dotenv import load_dotenv

from backend.models import Competition, Team, TeamInfo


class Command(BaseCommand):
    help = "Update team rankings from The Blue Alliance API"

    def add_arguments(self, parser):
        parser.add_argument(
            "event_keys",
            nargs="+",
            type=str,
            help="Event keys to update rankings for (e.g., 2020gagai 2020gadal)",
        )
        parser.add_argument(
            "--api-key",
            type=str,
            default="",
            help="TBA API key (or set TBA_API_KEY environment variable)",
        )

    def handle(self, *args, **options):
        env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)

        api_key = options["api_key"]
        if not api_key:
            api_key = os.environ.get("TBA_API_KEY", "")

        if not api_key:
            self.stdout.write(
                self.style.ERROR(
                    "API key required. Provide via --api-key or TBA_API_KEY environment variable"
                )
            )
            return

        tba = tbapy.TBA(api_key)

        for event_key in options["event_keys"]:
            self.stdout.write(f"Updating rankings for: {event_key}")
            try:
                self.update_event_rankings(tba, event_key)
                self.stdout.write(
                    self.style.SUCCESS(f"Successfully updated rankings for {event_key}")
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"Error updating {event_key}: {str(e)}")
                )

    @transaction.atomic
    def update_event_rankings(self, tba, event_key):
        # Get competition from database
        try:
            competition = Competition.objects.get(code=event_key)
        except Competition.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(
                    f"  Competition {event_key} not found in database. Run import_tba_events first."
                )
            )
            return

        # Fetch rankings from TBA
        rankings_data = tba.event_rankings(event_key)

        if not rankings_data or "rankings" not in rankings_data:
            self.stdout.write(
                self.style.WARNING(f"  No rankings data available for {event_key}")
            )
            return

        rankings = rankings_data["rankings"]
        sort_order_info = rankings_data.get("sort_order_info", [])

        self.stdout.write(f"  Found {len(rankings)} team rankings")

        # Print sort order info for debugging
        if sort_order_info:
            self.stdout.write("  Sort order criteria:")
            for i, info in enumerate(sort_order_info, 1):
                self.stdout.write(f"    {i}. {info.get('name', 'Unknown')}")

        updated_count = 0
        for ranking in rankings:
            team_key = ranking.get("team_key", "")
            team_number = int(team_key.replace("frc", ""))

            try:
                team = Team.objects.get(number=team_number)
                team_info = TeamInfo.objects.get(team=team, competition=competition)

                # Only cache the rank - TBA handles all sorting
                team_info.rank = ranking.get("rank", 0)

                team_info.save()
                updated_count += 1

            except Team.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(
                        f"    Team {team_number} not found in database, skipping"
                    )
                )
            except TeamInfo.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(
                        f"    TeamInfo for {team_number} at {event_key} not found, skipping"
                    )
                )

        self.stdout.write(f"  Updated {updated_count} team rankings")
