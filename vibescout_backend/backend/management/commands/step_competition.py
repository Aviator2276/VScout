import random
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from backend.models import Competition, Match, Team, TeamInfo


class Command(BaseCommand):
    help = "Step through competition phases (day1, day2, alliance selection, playoffs)"

    def add_arguments(self, parser):
        parser.add_argument(
            "phase",
            type=str,
            choices=[
                "day1",
                "day2",
                "select-alliances-1",
                "select-alliances-2",
                "select-alliances-3",
                "quarterfinals",
                "semifinals",
                "finals",
            ],
            help="Competition phase to execute",
        )
        parser.add_argument(
            "--competition",
            type=str,
            default="TEST2026",
            help="Competition code (default: TEST2026)",
        )

    def handle(self, *args, **options):
        phase = options["phase"]
        comp_code = options["competition"]

        try:
            competition = Competition.objects.get(code=comp_code)
        except Competition.DoesNotExist:
            raise CommandError(f'Competition "{comp_code}" does not exist')

        if phase == "day1":
            self.play_day1_matches(competition)
        elif phase == "day2":
            self.play_day2_matches(competition)
        elif phase == "select-alliances-1":
            self.select_alliances_round_1(competition)
        elif phase == "select-alliances-2":
            self.select_alliances_round_2(competition)
        elif phase == "select-alliances-3":
            self.select_alliances_round_3(competition)
        elif phase == "quarterfinals":
            self.play_playoff_matches(competition, "quarterfinal")
        elif phase == "semifinals":
            self.play_playoff_matches(competition, "semifinal")
        elif phase == "finals":
            self.play_playoff_matches(competition, "final")

    def play_day1_matches(self, competition):
        """Play first half of qualification matches"""
        self.stdout.write(
            self.style.SUCCESS(f"\n=== DAY 1: First Half of Qualification Matches ===")
        )

        qual_matches = Match.objects.filter(
            competition=competition, match_type="qualification", has_played=False
        ).order_by("match_number")

        total_matches = qual_matches.count()
        half_point = total_matches // 2

        day1_matches = qual_matches[:half_point]

        if not day1_matches.exists():
            self.stdout.write(
                self.style.WARNING("No unplayed qualification matches found for Day 1")
            )
            return

        self.stdout.write(
            f"Playing matches 1-{half_point} ({day1_matches.count()} matches)...\n"
        )

        for match in day1_matches:
            self._play_match(match, competition)

        self._update_rankings(competition)
        self.stdout.write(
            self.style.SUCCESS(
                f"\n✓ Day 1 complete! {day1_matches.count()} matches played"
            )
        )

    def play_day2_matches(self, competition):
        """Play second half of qualification matches"""
        self.stdout.write(
            self.style.SUCCESS(f"\n=== DAY 2: Second Half of Qualification Matches ===")
        )

        qual_matches = Match.objects.filter(
            competition=competition, match_type="qualification", has_played=False
        ).order_by("match_number")

        if not qual_matches.exists():
            self.stdout.write(
                self.style.WARNING("No unplayed qualification matches found for Day 2")
            )
            return

        self.stdout.write(
            f"Playing remaining qualification matches ({qual_matches.count()} matches)...\n"
        )

        for match in qual_matches:
            self._play_match(match, competition)

        self._update_rankings(competition)
        self.stdout.write(
            self.style.SUCCESS(
                f"\n✓ Day 2 complete! {qual_matches.count()} matches played"
            )
        )
        self.stdout.write(self.style.SUCCESS("All qualification matches finished!"))

    def select_alliances_round_1(self, competition):
        """Alliance selection - Round 1 (Alliance captains 1-4 pick)"""
        self.stdout.write(self.style.SUCCESS(f"\n=== ALLIANCE SELECTION - Round 1 ==="))

        # Get top 8 ranked teams
        top_teams = TeamInfo.objects.filter(competition=competition).order_by("rank")[
            :8
        ]

        if top_teams.count() < 8:
            raise CommandError(
                "Not enough ranked teams. Complete qualification matches first."
            )

        self.stdout.write("\nTop 8 Teams (Alliance Captains):")
        for team_info in top_teams:
            self.stdout.write(
                f"  {team_info.rank}. Team {team_info.team.number} - {team_info.team.name} ({team_info.ranking_points} RP)"
            )

        self.stdout.write(self.style.SUCCESS("\n✓ Alliance Selection Round 1 ready"))
        self.stdout.write(
            "Top 4 teams (#1-4) will now pick their first alliance partner..."
        )

    def select_alliances_round_2(self, competition):
        """Alliance selection - Round 2 (Alliance captains 8-5 pick in reverse)"""
        self.stdout.write(self.style.SUCCESS(f"\n=== ALLIANCE SELECTION - Round 2 ==="))
        self.stdout.write(
            "Teams #8, 7, 6, 5 will now pick their first alliance partner (reverse order)..."
        )
        self.stdout.write(self.style.SUCCESS("\n✓ Alliance Selection Round 2 ready"))

    def select_alliances_round_3(self, competition):
        """Alliance selection - Round 3 (Alliance captains 1-8 pick second partner)"""
        self.stdout.write(self.style.SUCCESS(f"\n=== ALLIANCE SELECTION - Round 3 ==="))
        self.stdout.write(
            "All 8 alliance captains will now pick their second alliance partner..."
        )

        # Get top 8 for display
        top_teams = TeamInfo.objects.filter(competition=competition).order_by("rank")[
            :8
        ]

        self.stdout.write("\nFinal Alliance Captains:")
        for i, team_info in enumerate(top_teams, 1):
            self.stdout.write(
                f"  Alliance {i}: Team {team_info.team.number} - {team_info.team.name}"
            )

        self.stdout.write(self.style.SUCCESS("\n✓ Alliance Selection Complete"))
        self.stdout.write("Ready for playoff bracket!")

    def play_playoff_matches(self, competition, match_type):
        """Play playoff matches (quarterfinals, semifinals, or finals)"""
        match_type_display = match_type.capitalize()
        self.stdout.write(self.style.SUCCESS(f"\n=== {match_type_display.upper()} ==="))

        # Check if matches exist
        playoff_matches = Match.objects.filter(
            competition=competition, match_type=match_type
        )

        if not playoff_matches.exists():
            self.stdout.write(
                self.style.WARNING(
                    f"No {match_type} matches found. Creating matches..."
                )
            )
            self._create_playoff_matches(competition, match_type)
            playoff_matches = Match.objects.filter(
                competition=competition, match_type=match_type
            )

        unplayed = playoff_matches.filter(has_played=False).order_by(
            "set_number", "match_number"
        )

        if not unplayed.exists():
            self.stdout.write(
                self.style.WARNING(f"All {match_type} matches already played")
            )
            return

        self.stdout.write(f"Playing {unplayed.count()} {match_type} matches...\n")

        for match in unplayed:
            self._play_match(match, competition, is_playoff=True)

        self.stdout.write(self.style.SUCCESS(f"\n✓ {match_type_display} complete!"))

    def _create_playoff_matches(self, competition, match_type):
        """Create playoff matches based on alliance rankings"""
        top_teams = list(
            TeamInfo.objects.filter(competition=competition)
            .select_related("team")
            .order_by("rank")[:8]
        )

        if len(top_teams) < 8:
            raise CommandError("Need at least 8 teams for playoffs")

        if match_type == "quarterfinal":
            # Create 4 quarterfinal series (best of 3)
            matchups = [
                (top_teams[0].team, top_teams[7].team, 1),  # 1 vs 8
                (top_teams[1].team, top_teams[6].team, 2),  # 2 vs 7
                (top_teams[2].team, top_teams[5].team, 3),  # 3 vs 6
                (top_teams[3].team, top_teams[4].team, 4),  # 4 vs 5
            ]

            for blue_captain, red_captain, set_num in matchups:
                # Get alliance partners (simplified - just use next teams in ranking)
                available_teams = [
                    t.team
                    for t in top_teams
                    if t.team not in [blue_captain, red_captain]
                ]

                for match_num in range(1, 4):  # Best of 3
                    Match.objects.create(
                        competition=competition,
                        match_type="quarterfinal",
                        match_number=match_num,
                        set_number=set_num,
                        blue_team_1=blue_captain,
                        blue_team_2=available_teams[0]
                        if len(available_teams) > 0
                        else blue_captain,
                        blue_team_3=available_teams[1]
                        if len(available_teams) > 1
                        else blue_captain,
                        red_team_1=red_captain,
                        red_team_2=available_teams[2]
                        if len(available_teams) > 2
                        else red_captain,
                        red_team_3=available_teams[3]
                        if len(available_teams) > 3
                        else red_captain,
                        has_played=False,
                    )

            self.stdout.write(self.style.SUCCESS("Created quarterfinal matches"))

        elif match_type == "semifinal":
            # Create 2 semifinal series
            for set_num in range(1, 3):
                for match_num in range(1, 4):
                    Match.objects.create(
                        competition=competition,
                        match_type="semifinal",
                        match_number=match_num,
                        set_number=set_num,
                        blue_team_1=top_teams[set_num - 1].team,
                        blue_team_2=top_teams[2].team,
                        blue_team_3=top_teams[3].team,
                        red_team_1=top_teams[set_num + 3].team,
                        red_team_2=top_teams[4].team,
                        red_team_3=top_teams[5].team,
                        has_played=False,
                    )

            self.stdout.write(self.style.SUCCESS("Created semifinal matches"))

        elif match_type == "final":
            # Create finals series
            for match_num in range(1, 4):
                Match.objects.create(
                    competition=competition,
                    match_type="final",
                    match_number=match_num,
                    set_number=1,
                    blue_team_1=top_teams[0].team,
                    blue_team_2=top_teams[1].team,
                    blue_team_3=top_teams[2].team,
                    red_team_1=top_teams[3].team,
                    red_team_2=top_teams[4].team,
                    red_team_3=top_teams[5].team,
                    has_played=False,
                )

            self.stdout.write(self.style.SUCCESS("Created final matches"))

    def _play_match(self, match, competition, is_playoff=False):
        """Simulate playing a single match"""
        blue_teams = [match.blue_team_1, match.blue_team_2, match.blue_team_3]
        red_teams = [match.red_team_1, match.red_team_2, match.red_team_3]

        # Generate random scores
        match.blue_1_auto_fuel = random.randint(3, 7)
        match.blue_2_auto_fuel = random.randint(3, 7)
        match.blue_3_auto_fuel = random.randint(3, 7)
        match.red_1_auto_fuel = random.randint(3, 7)
        match.red_2_auto_fuel = random.randint(3, 7)
        match.red_3_auto_fuel = random.randint(3, 7)

        match.blue_1_teleop_fuel = random.randint(5, 15)
        match.blue_2_teleop_fuel = random.randint(5, 15)
        match.blue_3_teleop_fuel = random.randint(5, 15)
        match.red_1_teleop_fuel = random.randint(5, 15)
        match.red_2_teleop_fuel = random.randint(5, 15)
        match.red_3_teleop_fuel = random.randint(5, 15)

        match.blue_1_fuel_scored = match.blue_1_auto_fuel + match.blue_1_teleop_fuel
        match.blue_2_fuel_scored = match.blue_2_auto_fuel + match.blue_2_teleop_fuel
        match.blue_3_fuel_scored = match.blue_3_auto_fuel + match.blue_3_teleop_fuel
        match.red_1_fuel_scored = match.red_1_auto_fuel + match.red_1_teleop_fuel
        match.red_2_fuel_scored = match.red_2_auto_fuel + match.red_2_teleop_fuel
        match.red_3_fuel_scored = match.red_3_auto_fuel + match.red_3_teleop_fuel

        match.total_blue_fuels = (
            match.blue_1_fuel_scored
            + match.blue_2_fuel_scored
            + match.blue_3_fuel_scored
        )
        match.total_red_fuels = (
            match.red_1_fuel_scored + match.red_2_fuel_scored + match.red_3_fuel_scored
        )

        match.has_played = True
        match.save()

        # Update rankings for qualification matches
        if match.match_type == "qualification":
            blue_score = match.total_blue_fuels
            red_score = match.total_red_fuels

            if blue_score > red_score:
                rp_blue = Decimal("2.0")
                rp_red = Decimal("0.0")
                winner = "BLUE"
            elif red_score > blue_score:
                rp_blue = Decimal("0.0")
                rp_red = Decimal("2.0")
                winner = "RED"
            else:
                rp_blue = Decimal("1.0")
                rp_red = Decimal("1.0")
                winner = "TIE"

            # Update team stats
            for team in blue_teams:
                team_info = TeamInfo.objects.get(team=team, competition=competition)
                if blue_score > red_score:
                    team_info.win += 1
                elif blue_score < red_score:
                    team_info.lose += 1
                else:
                    team_info.tie += 1
                team_info.ranking_points += rp_blue
                team_info.save()

            for team in red_teams:
                team_info = TeamInfo.objects.get(team=team, competition=competition)
                if red_score > blue_score:
                    team_info.win += 1
                elif red_score < blue_score:
                    team_info.lose += 1
                else:
                    team_info.tie += 1
                team_info.ranking_points += rp_red
                team_info.save()

            self.stdout.write(
                f"  Q{match.match_number}: Blue {match.total_blue_fuels} - Red {match.total_red_fuels} "
                f"[{winner}]"
            )
        else:
            # Playoff match
            winner = "BLUE" if match.total_blue_fuels > match.total_red_fuels else "RED"
            self.stdout.write(
                f"  {match.match_type.capitalize()} Set {match.set_number} Match {match.match_number}: "
                f"Blue {match.total_blue_fuels} - Red {match.total_red_fuels} [{winner}]"
            )

    def _update_rankings(self, competition):
        """Update team rankings based on ranking points"""
        team_infos = TeamInfo.objects.filter(competition=competition).order_by(
            "-ranking_points", "-win", "lose"
        )

        for rank, team_info in enumerate(team_infos, start=1):
            team_info.rank = rank
            team_info.save()

        self.stdout.write("\nTop 10 Teams:")
        for team_info in team_infos[:10]:
            self.stdout.write(
                f"  {team_info.rank}. Team {team_info.team.number} - "
                f"{team_info.ranking_points} RP ({team_info.win}W-{team_info.lose}L-{team_info.tie}T)"
            )
