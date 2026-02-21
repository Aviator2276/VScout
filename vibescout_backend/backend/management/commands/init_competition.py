import os
from pathlib import Path

import tbapy
from django.core.management.base import BaseCommand
from django.db import transaction
from dotenv import load_dotenv

from backend.models import Competition, Team, TeamInfo


class Command(BaseCommand):
    help = "Initialize a competition from The Blue Alliance API with teams and TeamInfo entries"

    def add_arguments(self, parser):
        parser.add_argument(
            "event_key",
            type=str,
            help="TBA event key (e.g., 2025gagai, 2025gadal)",
        )
        parser.add_argument(
            "--api-key",
            type=str,
            default="",
            help="TBA API key (or set TBA_API_KEY environment variable)",
        )
        parser.add_argument(
            "--stream-time-day-1",
            type=int,
            default=0,
            help="Stream time offset day 1",
        )
        parser.add_argument(
            "--stream-time-day-2",
            type=int,
            default=0,
            help="Stream time offset day 2",
        )
        parser.add_argument(
            "--stream-time-day-3",
            type=int,
            default=0,
            help="Stream time offset day 3",
        )
        parser.add_argument(
            "--stream-link-day-1",
            type=str,
            default="",
            help="Stream link day 1",
        )
        parser.add_argument(
            "--stream-link-day-2",
            type=str,
            default="",
            help="Stream link day 2",
        )
        parser.add_argument(
            "--stream-link-day-3",
            type=str,
            default="",
            help="Stream link day 3",
        )

    def handle(self, *args, **options):
        # Load environment variables
        env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)

        # Get API key
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

        event_key = options["event_key"]

        self.stdout.write(
            self.style.SUCCESS(f"\n=== Initializing Competition from TBA ===")
        )
        self.stdout.write(f"Event key: {event_key}")

        try:
            tba = tbapy.TBA(api_key)
            self.initialize_competition(tba, event_key, options)
            self.stdout.write(
                self.style.SUCCESS(f"\n✓ Successfully initialized {event_key}")
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"Error initializing {event_key}: {str(e)}")
            )
            raise

    @transaction.atomic
    def initialize_competition(self, tba, event_key, options=None):
        if options is None:
            options = {}

        # Fetch event info
        self.stdout.write("\nFetching event information from TBA...")
        event_info = tba.event(event_key)

        defaults = {
            "name": event_info["name"],
            "offset_stream_time_to_unix_timestamp_day_1": options.get(
                "stream_time_day_1", 0
            ),
            "offset_stream_time_to_unix_timestamp_day_2": options.get(
                "stream_time_day_2", 0
            ),
            "offset_stream_time_to_unix_timestamp_day_3": options.get(
                "stream_time_day_3", 0
            ),
        }

        if options.get("stream_link_day_1"):
            defaults["stream_link_day_1"] = options.get("stream_link_day_1")
        if options.get("stream_link_day_2"):
            defaults["stream_link_day_2"] = options.get("stream_link_day_2")
        if options.get("stream_link_day_3"):
            defaults["stream_link_day_3"] = options.get("stream_link_day_3")

        # Create competition
        competition, created = Competition.objects.update_or_create(
            code=event_key, defaults=defaults
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ Created competition: {competition.name} ({event_key})"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ Updated competition: {competition.name} ({event_key})"
                )
            )

        # Fetch teams
        self.stdout.write("\nFetching teams from TBA...")
        teams_simple = tba.event_teams(event_key, simple=True)

        self.stdout.write(f"Found {len(teams_simple)} teams")

        created_count = 0
        existing_count = 0

        for team_data in teams_simple:
            team_number = team_data.get("team_number")
            nickname = team_data.get("nickname", f"Team {team_number}")

            # Get or create team
            team, created = Team.objects.get_or_create(
                number=team_number, defaults={"name": nickname}
            )

            if created:
                created_count += 1
            else:
                existing_count += 1
                # Update name if team already exists but has placeholder name
                if team.name.startswith("Team ") and not nickname.startswith("Team "):
                    team.name = nickname
                    team.save()

            # Create TeamInfo entry
            TeamInfo.objects.get_or_create(
                team=team,
                competition=competition,
                defaults={
                    "rank": 0,
                    "ranking_points": 0.0,
                    "tie": 0,
                    "win": 0,
                    "lose": 0,
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Created {created_count} new teams, found {existing_count} existing teams"
            )
        )
        self.stdout.write(
            self.style.SUCCESS(f"✓ Created {len(teams_simple)} TeamInfo entries")
        )

        # Summary
        self.stdout.write(self.style.SUCCESS("\n=== Initialization Complete! ==="))
        self.stdout.write(f"Competition: {competition.name} ({event_key})")
        self.stdout.write(f"Teams: {len(teams_simple)}")
        self.stdout.write("\nReady for match data to be synced.")
