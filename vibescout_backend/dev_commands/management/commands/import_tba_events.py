import os
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from dotenv import load_dotenv

from backend.models import Competition, Team, TeamInfo
from backend.utils.match_utils import import_match_from_dict
from backend.utils.tba_api import TBAClient


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

        tba = TBAClient(api_key)

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

        competition, created = Competition.objects.get_or_create(
            code=event_key, defaults=defaults
        )

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
