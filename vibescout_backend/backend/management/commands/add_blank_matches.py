import os
from pathlib import Path

import tbapy
from django.core.management.base import BaseCommand
from django.db import transaction
from dotenv import load_dotenv

from backend.models import Competition, Match, Team


class Command(BaseCommand):
    help = "Add blank qualification matches for a competition from TBA schedule"

    def add_arguments(self, parser):
        parser.add_argument(
            "competition_code",
            type=str,
            help="Competition code (e.g., 2025gacmp)",
        )
        parser.add_argument(
            "--api-key",
            type=str,
            default="",
            help="TBA API key (or set TBA_API_KEY environment variable)",
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

        competition_code = options["competition_code"]

        self.stdout.write(
            self.style.SUCCESS(f"\n=== Adding Blank Qualification Matches ===")
        )
        self.stdout.write(f"Competition: {competition_code}")

        try:
            tba = tbapy.TBA(api_key)
            self.add_blank_matches(tba, competition_code)
            self.stdout.write(
                self.style.SUCCESS(
                    f"\n✓ Successfully added blank matches for {competition_code}"
                )
            )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error adding matches: {str(e)}"))
            raise

    @transaction.atomic
    def add_blank_matches(self, tba, competition_code):
        # Get competition from database
        try:
            competition = Competition.objects.get(code=competition_code)
            self.stdout.write(f"Found competition: {competition.name}")
        except Competition.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(
                    f"Competition {competition_code} not found. Run init_competition first."
                )
            )
            return

        # Fetch all matches from TBA
        self.stdout.write("\nFetching matches from TBA...")
        matches = tba.event_matches(competition_code)

        # Filter for qualification matches only
        qual_matches = [m for m in matches if m.get("comp_level") == "qm"]

        self.stdout.write(f"Found {len(qual_matches)} qualification matches")

        created_count = 0
        skipped_count = 0

        # Get a default team to use for blank matches (first team in competition)
        default_team = Team.objects.filter(results__competition=competition).first()

        if not default_team:
            self.stdout.write(
                self.style.ERROR(
                    "No teams found for this competition. Run init_competition first."
                )
            )
            return

        for match_data in qual_matches:
            match_number = match_data.get("match_number")

            # Check if match already exists
            if Match.objects.filter(
                competition=competition,
                match_type="qualification",
                match_number=match_number,
            ).exists():
                skipped_count += 1
                continue

            # Get team assignments from TBA
            alliances = match_data.get("alliances", {})
            blue_alliance = alliances.get("blue", {})
            red_alliance = alliances.get("red", {})

            blue_team_keys = blue_alliance.get("team_keys", [])
            red_team_keys = red_alliance.get("team_keys", [])

            # Get teams or use defaults
            def get_team(team_keys, index):
                if len(team_keys) > index:
                    team_number = int(team_keys[index].replace("frc", ""))
                    team, _ = Team.objects.get_or_create(
                        number=team_number, defaults={"name": f"Team {team_number}"}
                    )
                    return team
                return default_team

            blue_team_1 = get_team(blue_team_keys, 0)
            blue_team_2 = get_team(blue_team_keys, 1)
            blue_team_3 = get_team(blue_team_keys, 2)
            red_team_1 = get_team(red_team_keys, 0)
            red_team_2 = get_team(red_team_keys, 1)
            red_team_3 = get_team(red_team_keys, 2)

            # Get predicted time if available
            predicted_time = match_data.get("predicted_time", 0) or 0

            # Create blank match
            Match.objects.create(
                competition=competition,
                match_number=match_number,
                match_type="qualification",
                set_number=1,
                has_played=False,
                blue_team_1=blue_team_1,
                blue_team_2=blue_team_2,
                blue_team_3=blue_team_3,
                red_team_1=red_team_1,
                red_team_2=red_team_2,
                red_team_3=red_team_3,
                predicted_match_time=predicted_time,
                start_match_time=0,
                end_match_time=0,
                total_points=0,
                total_blue_fuels=0,
                total_red_fuels=0,
                blue_1_auto_fuel=0,
                blue_2_auto_fuel=0,
                blue_3_auto_fuel=0,
                red_1_auto_fuel=0,
                red_2_auto_fuel=0,
                red_3_auto_fuel=0,
                blue_1_teleop_fuel=0,
                blue_2_teleop_fuel=0,
                blue_3_teleop_fuel=0,
                red_1_teleop_fuel=0,
                red_2_teleop_fuel=0,
                red_3_teleop_fuel=0,
                blue_1_fuel_scored=0,
                blue_2_fuel_scored=0,
                blue_3_fuel_scored=0,
                red_1_fuel_scored=0,
                red_2_fuel_scored=0,
                red_3_fuel_scored=0,
                blue_1_climb="None",
                blue_2_climb="None",
                blue_3_climb="None",
                red_1_climb="None",
                red_2_climb="None",
                red_3_climb="None",
                blue_1_auto_climb=False,
                blue_2_auto_climb=False,
                blue_3_auto_climb=False,
                red_1_auto_climb=False,
                red_2_auto_climb=False,
                red_3_auto_climb=False,
                calculated_points=0,
                blue_total_score=0,
                red_total_score=0,
                blue_ranking_points=0,
                red_ranking_points=0,
                winning_alliance=None,
                blue_auto_points=0,
                red_auto_points=0,
                blue_teleop_points=0,
                red_teleop_points=0,
                blue_endgame_points=0,
                red_endgame_points=0,
                blue_penalties=0,
                red_penalties=0,
            )
            created_count += 1

            if created_count % 10 == 0:
                self.stdout.write(f"  Created {created_count} matches...")

        # Summary
        self.stdout.write(
            self.style.SUCCESS(
                f"\n✓ Created {created_count} blank qualification matches"
            )
        )
        if skipped_count > 0:
            self.stdout.write(f"  Skipped {skipped_count} existing matches")

        self.stdout.write("\nMatches are ready to be updated by background tasks!")
