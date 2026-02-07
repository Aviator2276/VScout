import os
from pathlib import Path

import tbapy
from django.core.management.base import BaseCommand
from django.db import transaction
from dotenv import load_dotenv

from backend.models import Competition, Match, Team


class Command(BaseCommand):
    help = "Add a single match from The Blue Alliance API to an existing competition"

    def add_arguments(self, parser):
        parser.add_argument(
            "competition_code",
            type=str,
            help="Competition code (e.g., 2025gagai)",
        )
        parser.add_argument(
            "match_number",
            type=int,
            help="Match number to add",
        )
        parser.add_argument(
            "--match-type",
            type=str,
            default="qm",
            choices=["qm", "qf", "sf", "f"],
            help="Match type: qm (qualification), qf (quarterfinal), sf (semifinal), f (final)",
        )
        parser.add_argument(
            "--set-number",
            type=int,
            default=1,
            help="Set number for playoff matches (default: 1)",
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
        match_number = options["match_number"]
        match_type = options["match_type"]
        set_number = options["set_number"]

        self.stdout.write(self.style.SUCCESS(f"\n=== Adding Match from TBA ==="))
        self.stdout.write(f"Competition: {competition_code}")
        self.stdout.write(f"Match: {match_type.upper()}{match_number}")

        try:
            tba = tbapy.TBA(api_key)
            self.add_match(tba, competition_code, match_number, match_type, set_number)
            self.stdout.write(self.style.SUCCESS(f"\n✓ Successfully added match"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error adding match: {str(e)}"))
            raise

    @transaction.atomic
    def add_match(
        self, tba, competition_code, match_number, match_type_code, set_number
    ):
        # Get competition
        try:
            competition = Competition.objects.get(code=competition_code)
            self.stdout.write(f"Found competition: {competition.name}")
        except Competition.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(
                    f"\nCompetition {competition_code} does not exist. Run init_competition first."
                )
            )
            return

        # Build TBA match key
        # Format: {event_key}_{comp_level}{set_number}m{match_number}
        # Examples: 2025gagai_qm1, 2025gagai_qf1m1, 2025gagai_sf2m1, 2025gagai_f1m1
        if match_type_code == "qm":
            tba_match_key = f"{competition_code}_{match_type_code}{match_number}"
        else:
            tba_match_key = (
                f"{competition_code}_{match_type_code}{set_number}m{match_number}"
            )

        self.stdout.write(f"\nFetching match from TBA: {tba_match_key}")

        # Fetch match data from TBA
        try:
            match_data = tba.match(tba_match_key)
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"Failed to fetch match from TBA: {str(e)}")
            )
            return

        # Extract match details
        alliances = match_data.get("alliances", {})
        blue_alliance = alliances.get("blue", {})
        red_alliance = alliances.get("red", {})

        blue_team_keys = blue_alliance.get("team_keys", [])
        red_team_keys = red_alliance.get("team_keys", [])

        if len(blue_team_keys) < 3 or len(red_team_keys) < 3:
            self.stdout.write(
                self.style.ERROR("Match has incomplete team data - skipping")
            )
            return

        # Get or create teams
        blue_teams = [self.get_or_create_team(key) for key in blue_team_keys[:3]]
        red_teams = [self.get_or_create_team(key) for key in red_team_keys[:3]]

        # Map match type
        match_type_map = {
            "qm": "qualification",
            "qf": "quarterfinal",
            "sf": "semifinal",
            "f": "final",
        }
        match_type = match_type_map.get(match_type_code, "qualification")

        # Extract scores and breakdown
        score_breakdown = match_data.get("score_breakdown", {})
        blue_breakdown = score_breakdown.get("blue", {})
        red_breakdown = score_breakdown.get("red", {})

        blue_score = blue_alliance.get("score", 0) or 0
        red_score = red_alliance.get("score", 0) or 0

        # Extract year from event key
        year = int(competition_code[:4])

        # Calculate game piece counts based on year
        blue_auto_cells = 0
        red_auto_cells = 0
        blue_teleop_cells = 0
        red_teleop_cells = 0

        if year == 2020:
            blue_auto_cells = (
                blue_breakdown.get("autoCellsBottom", 0)
                + blue_breakdown.get("autoCellsOuter", 0)
                + blue_breakdown.get("autoCellsInner", 0)
            )
            red_auto_cells = (
                red_breakdown.get("autoCellsBottom", 0)
                + red_breakdown.get("autoCellsOuter", 0)
                + red_breakdown.get("autoCellsInner", 0)
            )
            blue_teleop_cells = (
                blue_breakdown.get("teleopCellsBottom", 0)
                + blue_breakdown.get("teleopCellsOuter", 0)
                + blue_breakdown.get("teleopCellsInner", 0)
            )
            red_teleop_cells = (
                red_breakdown.get("teleopCellsBottom", 0)
                + red_breakdown.get("teleopCellsOuter", 0)
                + red_breakdown.get("teleopCellsInner", 0)
            )
        elif year == 2025:
            # 2025 Reefscape
            blue_auto_cells = blue_breakdown.get("autoCoralCount", 0)
            red_auto_cells = red_breakdown.get("autoCoralCount", 0)
            blue_teleop_cells = blue_breakdown.get("teleopCoralCount", 0)
            red_teleop_cells = red_breakdown.get("teleopCoralCount", 0)
        elif year == 2026:
            # 2026 - Use hub score
            hub_blue = blue_breakdown.get("hubScore", {})
            hub_red = red_breakdown.get("hubScore", {})
            # Sum auto and teleop game pieces from hub
            blue_auto_cells = (
                hub_blue.get("autoGamePieces", 0) if isinstance(hub_blue, dict) else 0
            )
            red_auto_cells = (
                hub_red.get("autoGamePieces", 0) if isinstance(hub_red, dict) else 0
            )
            blue_teleop_cells = (
                hub_blue.get("teleopGamePieces", 0) if isinstance(hub_blue, dict) else 0
            )
            red_teleop_cells = (
                hub_red.get("teleopGamePieces", 0) if isinstance(hub_red, dict) else 0
            )

        total_blue_fuels = blue_auto_cells + blue_teleop_cells
        total_red_fuels = red_auto_cells + red_teleop_cells

        # Extract time fields
        predicted_match_time = match_data.get("predicted_time", 0) or 0
        start_match_time = match_data.get("actual_time", 0) or 0
        end_match_time = match_data.get("post_result_time", 0) or 0

        # Map climb values
        def map_climb(endgame_value, year):
            if year == 2020:
                if endgame_value == "Park":
                    return "L1"
                elif endgame_value == "Hang":
                    return "L3"
            elif year == 2025:
                # 2025 Reefscape: DeepCage, None, Parked, ShallowCage
                if endgame_value == "Parked":
                    return "L1"
                elif endgame_value == "ShallowCage":
                    return "L2"
                elif endgame_value == "DeepCage":
                    return "L3"
            elif year == 2026:
                # 2026: TowerRobot_2026 - need to check schema
                # For now, map similar to 2025
                if isinstance(endgame_value, str):
                    lower_val = endgame_value.lower()
                    if "park" in lower_val or "low" in lower_val:
                        return "L1"
                    elif "mid" in lower_val or "shallow" in lower_val:
                        return "L2"
                    elif (
                        "high" in lower_val
                        or "deep" in lower_val
                        or "cage" in lower_val
                    ):
                        return "L3"
            return "None"

        # Create or update match
        match, created = Match.objects.update_or_create(
            competition=competition,
            match_type=match_type,
            set_number=set_number,
            match_number=match_number,
            defaults={
                "predicted_match_time": predicted_match_time,
                "start_match_time": start_match_time,
                "end_match_time": end_match_time,
                "blue_team_1": blue_teams[0],
                "blue_team_2": blue_teams[1],
                "blue_team_3": blue_teams[2],
                "red_team_1": red_teams[0],
                "red_team_2": red_teams[1],
                "red_team_3": red_teams[2],
                "total_points": blue_score + red_score,
                "total_blue_fuels": total_blue_fuels,
                "total_red_fuels": total_red_fuels,
                "blue_1_climb": map_climb(
                    blue_breakdown.get("endgameRobot1", "None"), year
                ),
                "blue_2_climb": map_climb(
                    blue_breakdown.get("endgameRobot2", "None"), year
                ),
                "blue_3_climb": map_climb(
                    blue_breakdown.get("endgameRobot3", "None"), year
                ),
                "red_1_climb": map_climb(
                    red_breakdown.get("endgameRobot1", "None"), year
                ),
                "red_2_climb": map_climb(
                    red_breakdown.get("endgameRobot2", "None"), year
                ),
                "red_3_climb": map_climb(
                    red_breakdown.get("endgameRobot3", "None"), year
                ),
                "calculated_points": blue_score + red_score,
                "has_played": True,
            },
        )

        action = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(f"{action} match: {match_type.title()} #{match_number}")
        )
        self.stdout.write(
            f"  Blue Alliance: {blue_teams[0].number}, {blue_teams[1].number}, {blue_teams[2].number} - Score: {blue_score}"
        )
        self.stdout.write(
            f"  Red Alliance: {red_teams[0].number}, {red_teams[1].number}, {red_teams[2].number} - Score: {red_score}"
        )

    def get_or_create_team(self, team_key):
        """Get or create a team from a TBA team key"""
        team_number = int(team_key.replace("frc", ""))

        team, created = Team.objects.get_or_create(
            number=team_number, defaults={"name": f"Team {team_number}"}
        )

        if created:
            self.stdout.write(f"  Created team: {team_number}")

        return team
