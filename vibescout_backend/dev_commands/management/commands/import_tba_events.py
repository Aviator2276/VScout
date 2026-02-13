import os
from pathlib import Path

import tbapy
from django.core.management.base import BaseCommand
from django.db import transaction
from dotenv import load_dotenv

from backend.models import Competition, Match, Team, TeamInfo
from backend.utils.match_utils import import_match_from_dict


class Command(BaseCommand):
    help = "Import event data from The Blue Alliance API"

    def add_arguments(self, parser):
        parser.add_argument(
            "event_keys",
            nargs="+",
            type=str,
            help="Event keys to import (e.g., 2020gagai 2020gadal)",
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
            self.stdout.write(f"Processing event: {event_key}")
            try:
                self.import_event(tba, event_key)
                self.stdout.write(
                    self.style.SUCCESS(f"Successfully imported {event_key}")
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"Error importing {event_key}: {str(e)}")
                )

    @transaction.atomic
    def import_event(self, tba, event_key):
        event_info = tba.event(event_key)

        # Fetch and cache team names for this event
        self.stdout.write("  Fetching team information...")
        teams_simple = tba.event_teams(event_key, simple=True)
        self.team_names_cache = {}
        for team_data in teams_simple:
            team_number = team_data.get("team_number")
            nickname = team_data.get("nickname", f"Team {team_number}")
            self.team_names_cache[team_number] = nickname
        self.stdout.write(f"  Cached {len(self.team_names_cache)} team names")

        defaults = {"name": event_info["name"]}

        # Add stream links for specific competitions
        if event_key == "2025gacmp":
            # Stream timestamps where first match of each day starts:
            # Day 1: 3:56:03, Day 2: 35:25, Day 3: 27:31
            stream_time_day_1 = (3 * 3600) + (56 * 60) + 3  # 14125 seconds
            stream_time_day_2 = (35 * 60) + 25  # 2087 seconds
            stream_time_day_3 = (27 * 60) + 31  # 1613 seconds

            defaults.update(
                {
                    "stream_link_day_1": "https://www.youtube.com/watch?v=p-CZ4LRTTqQ",
                    "stream_link_day_2": "https://www.youtube.com/watch?v=TJuzMzMi-g4&pp=2AaxDA%3D%3D",
                    "stream_link_day_3": "https://www.youtube.com/watch?v=0oHvm-ZECB0",
                }
            )

        competition, created = Competition.objects.get_or_create(
            code=event_key, defaults=defaults
        )

        # Update stream links if competition already exists
        if not created and event_key == "2025gacmp":
            competition.stream_link_day_1 = (
                "https://www.youtube.com/watch?v=p-CZ4LRTTqQ"
            )
            competition.stream_link_day_2 = (
                "https://www.youtube.com/watch?v=TJuzMzMi-g4&pp=2AaxDA%3D%3D"
            )
            competition.stream_link_day_3 = (
                "https://www.youtube.com/watch?v=0oHvm-ZECB0"
            )
            competition.save()

        if created:
            self.stdout.write(f"  Created competition: {competition.name}")
        else:
            self.stdout.write(f"  Using existing competition: {competition.name}")

        matches = tba.event_matches(event_key)
        self.stdout.write(f"  Found {len(matches)} matches")

        teams_in_event = set()
        for match_data in matches:
            match_teams = self.import_match(match_data, competition)
            teams_in_event.update(match_teams)

        self.stdout.write(f"  Imported {len(matches)} matches for {event_key}")

        self.create_team_infos(teams_in_event, competition)
        self.stdout.write(
            f"  Created/verified TeamInfo records for {len(teams_in_event)} teams"
        )

        # Calculate and set offsets for 2025gacmp
        if event_key == "2025gacmp":
            self.calculate_and_set_offsets(
                competition, stream_time_day_1, stream_time_day_2, stream_time_day_3
            )

    def import_match(self, match_data, competition):
        """Import a match using the shared utility function"""
        try:
            return import_match_from_dict(
                match_data, competition, self.team_names_cache, self.stdout
            )
        except Exception as e:
            self.stdout.write(
                self.style.WARNING(
                    f"  Skipping match {match_data.get('key')} - {str(e)}"
                )
            )
            return []

    def get_or_create_team(self, team_key):
        team_number = int(team_key.replace("frc", ""))

        # Use cached team name if available
        team_name = self.team_names_cache.get(team_number, f"Team {team_number}")

        team, created = Team.objects.get_or_create(
            number=team_number, defaults={"name": team_name}
        )

        # Update name if team already exists but has placeholder name
        if not created and team.name.startswith("Team "):
            team.name = team_name
            team.save()

        return team

    def calculate_and_set_offsets(
        self, competition, stream_time_day_1, stream_time_day_2, stream_time_day_3
    ):
        """Calculate offsets based on first match of each day and stream timestamps"""
        from django.db.models import Min

        # Get all matches with start times, ordered by start time
        matches = Match.objects.filter(
            competition=competition, start_match_time__gt=0
        ).order_by("start_match_time")

        if not matches.exists():
            self.stdout.write(
                self.style.WARNING(
                    "  No matches with start times found, cannot calculate offsets"
                )
            )
            return

        # Get first match time to determine day boundaries
        first_match_time = matches.first().start_match_time
        day_1_end = first_match_time + (12 * 3600)  # 12 hours after first match
        day_2_end = day_1_end + (24 * 3600)  # 24 hours after day 1 end

        # Find first match of each day
        first_match_day_1 = matches.filter(start_match_time__lt=day_1_end).first()
        first_match_day_2 = matches.filter(
            start_match_time__gte=day_1_end, start_match_time__lt=day_2_end
        ).first()
        first_match_day_3 = matches.filter(start_match_time__gte=day_2_end).first()

        # Calculate offsets: offset = unix_timestamp - stream_time
        if first_match_day_1:
            competition.offset_stream_time_to_unix_timestamp_day_1 = (
                first_match_day_1.start_match_time - stream_time_day_1
            )
            self.stdout.write(
                f"  Set day 1 offset: {competition.offset_stream_time_to_unix_timestamp_day_1}"
            )

        if first_match_day_2:
            competition.offset_stream_time_to_unix_timestamp_day_2 = (
                first_match_day_2.start_match_time - stream_time_day_2
            )
            self.stdout.write(
                f"  Set day 2 offset: {competition.offset_stream_time_to_unix_timestamp_day_2}"
            )

        if first_match_day_3:
            competition.offset_stream_time_to_unix_timestamp_day_3 = (
                first_match_day_3.start_match_time - stream_time_day_3
            )
            self.stdout.write(
                f"  Set day 3 offset: {competition.offset_stream_time_to_unix_timestamp_day_3}"
            )

        competition.save()
        self.stdout.write(self.style.SUCCESS("  ✓ Offsets calculated and saved"))

    def create_team_infos(self, teams, competition):
        for team in teams:
            team_info, created = TeamInfo.objects.get_or_create(
                team=team,
                competition=competition,
                defaults={
                    "ranking_points": 0.0,
                    "tie": 0,
                    "win": 0,
                    "lose": 0,
                },
            )
            if created:
                self.stdout.write(
                    f"    Created TeamInfo for Team {team.number} in {competition.name}"
                )
