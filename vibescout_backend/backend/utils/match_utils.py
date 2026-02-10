"""
Utility functions for match management.
"""

import tbapy
from django.db import transaction

from backend.models import Competition, Match, Team


@transaction.atomic
def add_match_from_tba(
    tba_client: tbapy.TBA,
    competition_code: str,
    match_number: int,
    match_type_code: str,
    set_number: int,
    stdout=None,
):
    """
    Add or update a match from The Blue Alliance API.

    Args:
        tba_client: Initialized TBA API client
        competition_code: Competition code (e.g., '2025gagai')
        match_number: Match number
        match_type_code: Match type code ('qm', 'qf', 'sf', 'f')
        set_number: Set number for playoff matches
        stdout: Optional output stream for logging

    Returns:
        Match object that was created or updated

    Raises:
        Competition.DoesNotExist: If competition doesn't exist
        Exception: If TBA API call fails or data is invalid
    """

    def log(message):
        """Helper to log messages if stdout is provided"""
        if stdout:
            stdout.write(message)

    # Get competition
    try:
        competition = Competition.objects.get(code=competition_code)
        log(f"Found competition: {competition.name}")
    except Competition.DoesNotExist:
        raise Competition.DoesNotExist(
            f"Competition {competition_code} does not exist. Run init_competition first."
        )

    # Build TBA match key
    if match_type_code == "qm":
        tba_match_key = f"{competition_code}_{match_type_code}{match_number}"
    else:
        tba_match_key = (
            f"{competition_code}_{match_type_code}{set_number}m{match_number}"
        )

    log(f"\nFetching match from TBA: {tba_match_key}")

    # Fetch match data from TBA
    try:
        match_data = tba_client.match(tba_match_key)
    except Exception as e:
        raise Exception(f"Failed to fetch match from TBA: {str(e)}")

    # Extract match details
    alliances = match_data.get("alliances", {})
    blue_alliance = alliances.get("blue", {})
    red_alliance = alliances.get("red", {})

    blue_team_keys = blue_alliance.get("team_keys", [])
    red_team_keys = red_alliance.get("team_keys", [])

    if len(blue_team_keys) < 3 or len(red_team_keys) < 3:
        raise Exception("Match has incomplete team data")

    # Get or create teams
    blue_teams = [get_or_create_team(key, stdout) for key in blue_team_keys[:3]]
    red_teams = [get_or_create_team(key, stdout) for key in red_team_keys[:3]]

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
            # 2025 Reefscape
            if endgame_value == "Parked":
                return "L1"
            elif endgame_value == "ShallowCage":
                return "L2"
            elif endgame_value == "DeepCage":
                return "L3"
        elif year == 2026:
            # 2026
            if isinstance(endgame_value, str):
                lower_val = endgame_value.lower()
                if "park" in lower_val or "low" in lower_val:
                    return "L1"
                elif "mid" in lower_val or "shallow" in lower_val:
                    return "L2"
                elif "high" in lower_val or "deep" in lower_val or "cage" in lower_val:
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
            "red_1_climb": map_climb(red_breakdown.get("endgameRobot1", "None"), year),
            "red_2_climb": map_climb(red_breakdown.get("endgameRobot2", "None"), year),
            "red_3_climb": map_climb(red_breakdown.get("endgameRobot3", "None"), year),
            "calculated_points": blue_score + red_score,
            "has_played": True,
        },
    )

    action = "Created" if created else "Updated"
    log(f"{action} match: {match_type.title()} #{match_number}")
    log(
        f"  Blue Alliance: {blue_teams[0].number}, {blue_teams[1].number}, {blue_teams[2].number} - Score: {blue_score}"
    )
    log(
        f"  Red Alliance: {red_teams[0].number}, {red_teams[1].number}, {red_teams[2].number} - Score: {red_score}"
    )

    return match


def get_or_create_team(team_key: str, stdout=None):
    """
    Get or create a team from a TBA team key.

    Args:
        team_key: TBA team key (e.g., 'frc254')
        stdout: Optional output stream for logging

    Returns:
        Team object
    """
    team_number = int(team_key.replace("frc", ""))

    team, created = Team.objects.get_or_create(
        number=team_number, defaults={"name": f"Team {team_number}"}
    )

    if created and stdout:
        stdout.write(f"  Created team: {team_number}")

    return team


@transaction.atomic
def import_match_from_dict(
    match_data: dict,
    competition: Competition,
    team_names_cache: dict = None,
    stdout=None,
):
    """
    Import a match from TBA match data dictionary.
    This is used by import_tba_events which fetches multiple matches at once.

    Args:
        match_data: Match data dictionary from TBA API
        competition: Competition object
        team_names_cache: Optional dict mapping team numbers to team names
        stdout: Optional output stream for logging

    Returns:
        List of Team objects that participated in the match

    Raises:
        Exception: If match data is incomplete
    """

    def log(message):
        """Helper to log messages if stdout is provided"""
        if stdout:
            stdout.write(message)

    alliances = match_data.get("alliances", {})
    blue_alliance = alliances.get("blue", {})
    red_alliance = alliances.get("red", {})

    blue_team_keys = blue_alliance.get("team_keys", [])
    red_team_keys = red_alliance.get("team_keys", [])

    if len(blue_team_keys) < 3 or len(red_team_keys) < 3:
        raise Exception("Match has incomplete team data")

    # Get teams with optional cached names
    def get_team_with_cache(team_key):
        team_number = int(team_key.replace("frc", ""))
        team_name = (
            team_names_cache.get(team_number, f"Team {team_number}")
            if team_names_cache
            else f"Team {team_number}"
        )

        team, created = Team.objects.get_or_create(
            number=team_number, defaults={"name": team_name}
        )

        # Update name if team already exists but has placeholder name
        if not created and team.name.startswith("Team ") and team_names_cache:
            team.name = team_name
            team.save()

        return team

    blue_teams = [get_team_with_cache(key) for key in blue_team_keys[:3]]
    red_teams = [get_team_with_cache(key) for key in red_team_keys[:3]]

    # Extract match info
    match_number = match_data.get("match_number", 0)
    tba_key = match_data.get("key", "")

    # Determine match type from TBA comp_level
    comp_level = match_data.get("comp_level", "qm")
    match_type_map = {
        "qm": "qualification",
        "qf": "quarterfinal",
        "sf": "semifinal",
        "f": "final",
    }
    match_type = match_type_map.get(comp_level, "qualification")

    # Extract set_number from TBA key (e.g., qf1m1 -> set 1, qf2m1 -> set 2)
    set_number = 1
    if comp_level in ["qf", "sf", "f"]:
        import re

        match_pattern = re.search(r"_(" + comp_level + r")(\d+)m", tba_key)
        if match_pattern:
            set_number = int(match_pattern.group(2))

    # Extract scores
    score_breakdown = match_data.get("score_breakdown", {})
    blue_breakdown = score_breakdown.get("blue", {})
    red_breakdown = score_breakdown.get("red", {})

    blue_score = blue_alliance.get("score", 0) or 0
    red_score = red_alliance.get("score", 0) or 0

    # Extract year
    year = int(tba_key[:4])

    # Calculate game piece counts based on year
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
        blue_auto_cells = blue_breakdown.get("autoCoralCount", 0)
        red_auto_cells = red_breakdown.get("autoCoralCount", 0)
        blue_teleop_cells = blue_breakdown.get("teleopCoralCount", 0)
        red_teleop_cells = red_breakdown.get("teleopCoralCount", 0)
    elif year == 2026:
        hub_blue = blue_breakdown.get("hubScore", {})
        hub_red = red_breakdown.get("hubScore", {})
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
    else:
        blue_auto_cells = red_auto_cells = blue_teleop_cells = red_teleop_cells = 0

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
            if endgame_value == "Parked":
                return "L1"
            elif endgame_value == "ShallowCage":
                return "L2"
            elif endgame_value == "DeepCage":
                return "L3"
        elif year == 2026:
            if isinstance(endgame_value, str):
                lower_val = endgame_value.lower()
                if "park" in lower_val or "low" in lower_val:
                    return "L1"
                elif "mid" in lower_val or "shallow" in lower_val:
                    return "L2"
                elif "high" in lower_val or "deep" in lower_val or "cage" in lower_val:
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
            "red_1_climb": map_climb(red_breakdown.get("endgameRobot1", "None"), year),
            "red_2_climb": map_climb(red_breakdown.get("endgameRobot2", "None"), year),
            "red_3_climb": map_climb(red_breakdown.get("endgameRobot3", "None"), year),
            "calculated_points": blue_score + red_score,
            "has_played": True,
        },
    )

    if created:
        log(f"    Created match: {tba_key}")

    return blue_teams + red_teams
