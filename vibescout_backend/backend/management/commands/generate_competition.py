import random

from django.core.management.base import BaseCommand
from django.db import models

from backend.models import Competition, Match, Team, TeamInfo


class Command(BaseCommand):
    help = "Generate a competition with teams, matches, and realistic data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--name", type=str, default="Test Competition 2026", help="Competition name"
        )
        parser.add_argument(
            "--code", type=str, default="TEST2026", help="Competition code"
        )
        parser.add_argument(
            "--teams", type=int, default=30, help="Number of teams (default: 30)"
        )
        parser.add_argument(
            "--qual-matches",
            type=int,
            default=10,
            help="Number of qualification matches per team (default: 10)",
        )

    def handle(self, *args, **options):
        comp_name = options["name"]
        comp_code = options["code"]
        num_teams = options["teams"]
        matches_per_team = options["qual_matches"]

        self.stdout.write(self.style.SUCCESS(f"Generating competition: {comp_name}"))

        # Create or get competition
        competition, created = Competition.objects.get_or_create(
            code=comp_code, defaults={"name": comp_name}
        )

        if not created:
            self.stdout.write(
                self.style.WARNING(
                    f"Competition {comp_code} already exists. Clearing old data..."
                )
            )
            competition.matches.all().delete()
            competition.results.all().delete()

        # Generate teams with power scaling (1-100, where higher = better)
        teams = []
        team_powers = {}

        self.stdout.write("Creating teams...")
        for i in range(num_teams):
            team_number = 1000 + i
            team, _ = Team.objects.get_or_create(
                number=team_number, defaults={"name": f"Team {team_number}"}
            )
            teams.append(team)

            # Power scaling: exponential distribution to create realistic skill gaps
            # Top teams are significantly better than bottom teams
            power = 100 - (i**1.5) / (num_teams**0.5)
            power = max(20, min(100, power))  # Clamp between 20-100
            team_powers[team.id] = power

            self.stdout.write(f"  Team {team_number}: Power {power:.1f}")

        # Create TeamInfo for each team
        self.stdout.write("Creating team info...")
        for team in teams:
            TeamInfo.objects.get_or_create(
                team=team,
                competition=competition,
                defaults={
                    "ranking_points": 0.0,
                    "win": 0,
                    "lose": 0,
                    "tie": 0,
                    "prescout_drivetrain": random.choice(["swerve", "tank", "mecanum"]),
                    "prescout_hopper_size": random.randint(3, 8),
                    "prescout_intake_type": random.choice(["inbumper", "overbumper"]),
                    "prescout_rotate_yaw": random.choice([True, False]),
                    "prescout_rotate_pitch": random.choice([True, False]),
                    "prescout_self_reported_accuracy": random.uniform(0.5, 0.95),
                    "prescout_unload_time": random.uniform(1.0, 5.0),
                    "prescout_range": random.choice(
                        ["alliance", "neutral", "opponent"]
                    ),
                    "prescout_climber": random.choice(["l1", "l2", "l3", "none"]),
                    "prescout_climber_auto": random.choice([True, False]),
                    "prescout_self_reported_auto_shoot": random.randint(0, 5),
                },
            )

        # Generate qualification matches
        total_qual_matches = (num_teams * matches_per_team) // 6
        self.stdout.write(f"Generating {total_qual_matches} qualification matches...")

        # Track how many matches each team has played
        team_match_counts = {team.id: 0 for team in teams}

        for match_num in range(1, total_qual_matches + 1):
            # Select 6 teams that need more matches, trying to balance
            available_teams = sorted(teams, key=lambda t: team_match_counts[t.id])
            selected_teams = available_teams[:6]
            random.shuffle(selected_teams)

            blue_teams = selected_teams[:3]
            red_teams = selected_teams[3:]

            # Calculate match results based on team power
            blue_power = sum(team_powers[t.id] for t in blue_teams) / 3
            red_power = sum(team_powers[t.id] for t in red_teams) / 3

            # Add randomness (±15%)
            blue_performance = blue_power * random.uniform(0.85, 1.15)
            red_performance = red_power * random.uniform(0.85, 1.15)

            # Generate match data based on performance
            match = Match.objects.create(
                competition=competition,
                match_number=match_num,
                match_type="qualification",
                has_played=True,
                blue_team_1=blue_teams[0],
                blue_team_2=blue_teams[1],
                blue_team_3=blue_teams[2],
                red_team_1=red_teams[0],
                red_team_2=red_teams[1],
                red_team_3=red_teams[2],
            )

            # Generate fuel scores based on team power
            for i, team in enumerate(blue_teams, 1):
                power = team_powers[team.id]
                auto_fuel = int(power / 20 * random.uniform(0.8, 1.2))
                teleop_fuel = int(power / 10 * random.uniform(0.8, 1.2))
                fuel_scored = int((auto_fuel + teleop_fuel) * random.uniform(0.7, 0.95))

                setattr(match, f"blue_{i}_auto_fuel", auto_fuel)
                setattr(match, f"blue_{i}_teleop_fuel", teleop_fuel)
                setattr(match, f"blue_{i}_fuel_scored", fuel_scored)
                setattr(
                    match, f"blue_{i}_climb", random.choice(["None", "L1", "L2", "L3"])
                )

                team_match_counts[team.id] += 1

            for i, team in enumerate(red_teams, 1):
                power = team_powers[team.id]
                auto_fuel = int(power / 20 * random.uniform(0.8, 1.2))
                teleop_fuel = int(power / 10 * random.uniform(0.8, 1.2))
                fuel_scored = int((auto_fuel + teleop_fuel) * random.uniform(0.7, 0.95))

                setattr(match, f"red_{i}_auto_fuel", auto_fuel)
                setattr(match, f"red_{i}_teleop_fuel", teleop_fuel)
                setattr(match, f"red_{i}_fuel_scored", fuel_scored)
                setattr(
                    match, f"red_{i}_climb", random.choice(["None", "L1", "L2", "L3"])
                )

                team_match_counts[team.id] += 1

            # Calculate totals
            match.total_blue_fuels = sum(
                [getattr(match, f"blue_{i}_fuel_scored") for i in range(1, 4)]
            )
            match.total_red_fuels = sum(
                [getattr(match, f"red_{i}_fuel_scored") for i in range(1, 4)]
            )

            # Set match overview fields
            match.blue_total_score = match.total_blue_fuels
            match.red_total_score = match.total_red_fuels

            # Determine winner
            if match.blue_total_score > match.red_total_score:
                match.winning_alliance = "blue"
            elif match.red_total_score > match.blue_total_score:
                match.winning_alliance = "red"
            else:
                match.winning_alliance = "tie"

            match.save()

            # Update team rankings based on match results
            blue_score = match.total_blue_fuels
            red_score = match.total_red_fuels

            if blue_score > red_score:
                rp_blue = 2.0
                rp_red = 0.0
                for team in blue_teams:
                    team_info = TeamInfo.objects.get(team=team, competition=competition)
                    team_info.win += 1
                    team_info.ranking_points += rp_blue
                    team_info.save()
                for team in red_teams:
                    team_info = TeamInfo.objects.get(team=team, competition=competition)
                    team_info.lose += 1
                    team_info.ranking_points += rp_red
                    team_info.save()
            elif red_score > blue_score:
                rp_blue = 0.0
                rp_red = 2.0
                for team in blue_teams:
                    team_info = TeamInfo.objects.get(team=team, competition=competition)
                    team_info.lose += 1
                    team_info.ranking_points += rp_blue
                    team_info.save()
                for team in red_teams:
                    team_info = TeamInfo.objects.get(team=team, competition=competition)
                    team_info.win += 1
                    team_info.ranking_points += rp_red
                    team_info.save()
            else:
                rp_blue = 1.0
                rp_red = 1.0
                for team in blue_teams + red_teams:
                    team_info = TeamInfo.objects.get(team=team, competition=competition)
                    team_info.tie += 1
                    team_info.ranking_points += 1.0
                    team_info.save()

        # Calculate average stats for each team
        self.stdout.write("Calculating team statistics...")
        for team in teams:
            team_info = TeamInfo.objects.get(team=team, competition=competition)

            # Get all matches for this team
            team_matches = Match.objects.filter(
                competition=competition, has_played=True
            ).filter(
                models.Q(blue_team_1=team)
                | models.Q(blue_team_2=team)
                | models.Q(blue_team_3=team)
                | models.Q(red_team_1=team)
                | models.Q(red_team_2=team)
                | models.Q(red_team_3=team)
            )

            if team_matches.exists():
                import statistics

                fuel_values = []
                auto_fuel_values = []
                climb_point_values = []
                total_fuel = 0
                total_auto_fuel = 0
                total_climb_points = 0
                match_count = team_matches.count()

                for match in team_matches:
                    # Find which position this team was in
                    for i in range(1, 4):
                        if getattr(match, f"blue_team_{i}") == team:
                            fuel = getattr(match, f"blue_{i}_fuel_scored")
                            auto = getattr(match, f"blue_{i}_auto_fuel")
                            climb = getattr(match, f"blue_{i}_climb")

                            fuel_values.append(fuel)
                            auto_fuel_values.append(auto)
                            total_fuel += fuel
                            total_auto_fuel += auto

                            climb_pts = 0
                            if climb == "L1":
                                climb_pts = 3
                            elif climb == "L2":
                                climb_pts = 6
                            elif climb == "L3":
                                climb_pts = 10
                            climb_point_values.append(climb_pts)
                            total_climb_points += climb_pts
                            break
                        elif getattr(match, f"red_team_{i}") == team:
                            fuel = getattr(match, f"red_{i}_fuel_scored")
                            auto = getattr(match, f"red_{i}_auto_fuel")
                            climb = getattr(match, f"red_{i}_climb")

                            fuel_values.append(fuel)
                            auto_fuel_values.append(auto)
                            total_fuel += fuel
                            total_auto_fuel += auto

                            climb_pts = 0
                            if climb == "L1":
                                climb_pts = 3
                            elif climb == "L2":
                                climb_pts = 6
                            elif climb == "L3":
                                climb_pts = 10
                            climb_point_values.append(climb_pts)
                            total_climb_points += climb_pts
                            break

                # Calculate averages
                team_info.avg_fuel_scored = total_fuel / match_count
                team_info.avg_auto_fuel = total_auto_fuel / match_count
                team_info.avg_climb_points = total_climb_points / match_count

                # Advanced stats
                team_info.auto_success = total_auto_fuel / match_count
                team_info.climb_success = total_climb_points / match_count
                team_info.avg_points_contributed = total_fuel / match_count

                # Calculate standard deviations
                if len(auto_fuel_values) > 1:
                    team_info.auto_success_sd = statistics.stdev(auto_fuel_values)
                else:
                    team_info.auto_success_sd = 0.0

                if len(climb_point_values) > 1:
                    team_info.climb_success_sd = statistics.stdev(climb_point_values)
                else:
                    team_info.climb_success_sd = 0.0

                # Consistency rating (0-100, higher = more consistent)
                if len(fuel_values) > 1 and team_info.avg_fuel_scored > 0:
                    fuel_sd = statistics.stdev(fuel_values)
                    cv = fuel_sd / team_info.avg_fuel_scored
                    team_info.consistency_rating = max(0, min(100, 100 - (cv * 100)))
                else:
                    team_info.consistency_rating = 100.0

                team_info.accuracy = random.uniform(0.6, 0.95)  # Simulated accuracy
                team_info.save()

        # Display final rankings
        self.stdout.write(self.style.SUCCESS("\n=== Final Rankings ==="))
        rankings = TeamInfo.objects.filter(competition=competition).order_by(
            "-ranking_points", "-win"
        )

        for rank, team_info in enumerate(rankings, 1):
            # Set the rank field
            team_info.rank = rank
            team_info.save()

            self.stdout.write(
                f"{rank:2d}. Team {team_info.team.number}: "
                f"{team_info.ranking_points:.1f} RP "
                f"({team_info.win}W-{team_info.lose}L-{team_info.tie}T) "
                f"Power: {team_powers[team_info.team.id]:.1f}"
            )

        # Form playoff alliances (top 8 alliances, 1-2-3 format)
        self.stdout.write(self.style.SUCCESS("\n=== Playoff Alliances (Top 8) ==="))
        top_24 = list(rankings[:24])

        alliances = []
        for alliance_num in range(1, 9):
            captain_idx = alliance_num - 1
            pick_2_idx = 24 - alliance_num
            pick_3_idx = 8 + alliance_num - 1

            if (
                captain_idx < len(top_24)
                and pick_2_idx < len(top_24)
                and pick_3_idx < len(top_24)
            ):
                captain = top_24[captain_idx]
                pick_2 = top_24[pick_2_idx]
                pick_3 = top_24[pick_3_idx]

                alliance = {
                    "number": alliance_num,
                    "teams": [captain.team, pick_2.team, pick_3.team],
                    "power": (
                        team_powers[captain.team.id]
                        + team_powers[pick_2.team.id]
                        + team_powers[pick_3.team.id]
                    )
                    / 3,
                }
                alliances.append(alliance)

                self.stdout.write(
                    f"Alliance {alliance_num}: "
                    f"{captain.team.number} (Captain), "
                    f"{pick_2.team.number}, "
                    f"{pick_3.team.number} "
                    f"(Avg Power: {alliance['power']:.1f})"
                )

        # Generate double elimination playoff matches
        self.stdout.write(
            self.style.SUCCESS("\n=== Generating Double Elimination Playoffs ===")
        )

        def create_playoff_match(
            blue_alliance, red_alliance, match_type, set_num, match_num
        ):
            """Create a playoff match between two alliances"""
            blue_teams = blue_alliance["teams"]
            red_teams = red_alliance["teams"]

            # Calculate alliance performance with randomness
            blue_performance = blue_alliance["power"] * random.uniform(0.85, 1.15)
            red_performance = red_alliance["power"] * random.uniform(0.85, 1.15)

            match = Match.objects.create(
                competition=competition,
                match_number=match_num,
                set_number=set_num,
                match_type=match_type,
                has_played=True,
                blue_team_1=blue_teams[0],
                blue_team_2=blue_teams[1],
                blue_team_3=blue_teams[2],
                red_team_1=red_teams[0],
                red_team_2=red_teams[1],
                red_team_3=red_teams[2],
            )

            # Generate match data based on alliance power
            for i, team in enumerate(blue_teams, 1):
                power = team_powers[team.id]
                auto_fuel = int(
                    power / 15 * random.uniform(0.9, 1.3)
                )  # Playoffs have higher performance
                teleop_fuel = int(power / 8 * random.uniform(0.9, 1.3))
                fuel_scored = int(
                    (auto_fuel + teleop_fuel) * random.uniform(0.75, 0.98)
                )

                setattr(match, f"blue_{i}_auto_fuel", auto_fuel)
                setattr(match, f"blue_{i}_teleop_fuel", teleop_fuel)
                setattr(match, f"blue_{i}_fuel_scored", fuel_scored)
                setattr(
                    match,
                    f"blue_{i}_climb",
                    random.choices(
                        ["None", "L1", "L2", "L3"], weights=[0.1, 0.2, 0.3, 0.4]
                    )[0],
                )

            for i, team in enumerate(red_teams, 1):
                power = team_powers[team.id]
                auto_fuel = int(power / 15 * random.uniform(0.9, 1.3))
                teleop_fuel = int(power / 8 * random.uniform(0.9, 1.3))
                fuel_scored = int(
                    (auto_fuel + teleop_fuel) * random.uniform(0.75, 0.98)
                )

                setattr(match, f"red_{i}_auto_fuel", auto_fuel)
                setattr(match, f"red_{i}_teleop_fuel", teleop_fuel)
                setattr(match, f"red_{i}_fuel_scored", fuel_scored)
                setattr(
                    match,
                    f"red_{i}_climb",
                    random.choices(
                        ["None", "L1", "L2", "L3"], weights=[0.1, 0.2, 0.3, 0.4]
                    )[0],
                )

            match.total_blue_fuels = sum(
                [getattr(match, f"blue_{i}_fuel_scored") for i in range(1, 4)]
            )
            match.total_red_fuels = sum(
                [getattr(match, f"red_{i}_fuel_scored") for i in range(1, 4)]
            )
            match.save()

            # Determine winner
            if match.total_blue_fuels > match.total_red_fuels:
                winner = blue_alliance
                loser = red_alliance
            else:
                winner = red_alliance
                loser = blue_alliance

            return match, winner, loser

        # Double Elimination Bracket Structure
        # Upper Bracket: Quarterfinals (each pairing gets its own set number)
        self.stdout.write("\n--- Upper Bracket Quarterfinals ---")
        upper_qf_winners = []
        lower_bracket = []

        # QF1: Alliance 1 vs Alliance 8 (Set 1) - In 2025 format, upper bracket QFs use 'semifinal' type
        match, winner, loser = create_playoff_match(
            alliances[0], alliances[7], "semifinal", 1, 1
        )
        self.stdout.write(
            f"QF1 (Set 1, Match 1): Alliance {alliances[0]['number']} vs Alliance {alliances[7]['number']} -> Winner: Alliance {winner['number']}"
        )
        upper_qf_winners.append(winner)
        lower_bracket.append(loser)

        # QF2: Alliance 4 vs Alliance 5 (Set 2)
        match, winner, loser = create_playoff_match(
            alliances[3], alliances[4], "semifinal", 2, 1
        )
        self.stdout.write(
            f"QF2 (Set 2, Match 1): Alliance {alliances[3]['number']} vs Alliance {alliances[4]['number']} -> Winner: Alliance {winner['number']}"
        )
        upper_qf_winners.append(winner)
        lower_bracket.append(loser)

        # QF3: Alliance 2 vs Alliance 7 (Set 3)
        match, winner, loser = create_playoff_match(
            alliances[1], alliances[6], "semifinal", 3, 1
        )
        self.stdout.write(
            f"QF3 (Set 3, Match 1): Alliance {alliances[1]['number']} vs Alliance {alliances[6]['number']} -> Winner: Alliance {winner['number']}"
        )
        upper_qf_winners.append(winner)
        lower_bracket.append(loser)

        # QF4: Alliance 3 vs Alliance 6 (Set 4)
        match, winner, loser = create_playoff_match(
            alliances[2], alliances[5], "semifinal", 4, 1
        )
        self.stdout.write(
            f"QF4 (Set 4, Match 1): Alliance {alliances[2]['number']} vs Alliance {alliances[5]['number']} -> Winner: Alliance {winner['number']}"
        )
        upper_qf_winners.append(winner)
        lower_bracket.append(loser)

        # Upper Bracket: Semifinals (each pairing gets its own set number)
        self.stdout.write("\n--- Upper Bracket Semifinals ---")
        upper_sf_winners = []

        # SF1: QF1 winner vs QF2 winner (Set 5)
        match, winner, loser = create_playoff_match(
            upper_qf_winners[0], upper_qf_winners[1], "semifinal", 5, 1
        )
        self.stdout.write(
            f"SF1 (Set 5, Match 1): Alliance {upper_qf_winners[0]['number']} vs Alliance {upper_qf_winners[1]['number']} -> Winner: Alliance {winner['number']}"
        )
        upper_sf_winners.append(winner)
        lower_bracket.append(loser)

        # SF2: QF3 winner vs QF4 winner (Set 6)
        match, winner, loser = create_playoff_match(
            upper_qf_winners[2], upper_qf_winners[3], "semifinal", 6, 1
        )
        self.stdout.write(
            f"SF2 (Set 6, Match 1): Alliance {upper_qf_winners[2]['number']} vs Alliance {upper_qf_winners[3]['number']} -> Winner: Alliance {winner['number']}"
        )
        upper_sf_winners.append(winner)
        lower_bracket.append(loser)

        # Lower Bracket: Round 1 (each pairing gets its own set number)
        self.stdout.write("\n--- Lower Bracket Round 1 ---")
        lower_r1_winners = []

        # LB1: QF1 loser vs QF2 loser (Set 7) - In 2025, lower bracket uses 'semifinal' type
        match, winner, loser = create_playoff_match(
            lower_bracket[0], lower_bracket[1], "semifinal", 7, 1
        )
        self.stdout.write(
            f"LB1 (Set 7, Match 1): Alliance {lower_bracket[0]['number']} vs Alliance {lower_bracket[1]['number']} -> Winner: Alliance {winner['number']}"
        )
        lower_r1_winners.append(winner)

        # LB2: QF3 loser vs QF4 loser (Set 8)
        match, winner, loser = create_playoff_match(
            lower_bracket[2], lower_bracket[3], "semifinal", 8, 1
        )
        self.stdout.write(
            f"LB2 (Set 8, Match 1): Alliance {lower_bracket[2]['number']} vs Alliance {lower_bracket[3]['number']} -> Winner: Alliance {winner['number']}"
        )
        lower_r1_winners.append(winner)

        # Lower Bracket: Round 2 - LB winners vs Upper SF losers (each pairing gets its own set number)
        self.stdout.write("\n--- Lower Bracket Round 2 ---")
        lower_r2_winners = []

        # LB3: LB1 winner vs SF1 loser (Set 9)
        match, winner, loser = create_playoff_match(
            lower_r1_winners[0], lower_bracket[4], "semifinal", 9, 1
        )
        self.stdout.write(
            f"LB3 (Set 9, Match 1): Alliance {lower_r1_winners[0]['number']} vs Alliance {lower_bracket[4]['number']} -> Winner: Alliance {winner['number']}"
        )
        lower_r2_winners.append(winner)

        # LB4: LB2 winner vs SF2 loser (Set 10)
        match, winner, loser = create_playoff_match(
            lower_r1_winners[1], lower_bracket[5], "semifinal", 10, 1
        )
        self.stdout.write(
            f"LB4 (Set 10, Match 1): Alliance {lower_r1_winners[1]['number']} vs Alliance {lower_bracket[5]['number']} -> Winner: Alliance {winner['number']}"
        )
        lower_r2_winners.append(winner)

        # Lower Bracket: Finals (Set 11)
        self.stdout.write("\n--- Lower Bracket Finals ---")
        match, lower_finalist, loser = create_playoff_match(
            lower_r2_winners[0], lower_r2_winners[1], "semifinal", 11, 1
        )
        self.stdout.write(
            f"LBF (Set 11, Match 1): Alliance {lower_r2_winners[0]['number']} vs Alliance {lower_r2_winners[1]['number']} -> Winner: Alliance {lower_finalist['number']}"
        )

        # Upper Bracket: Finals (Set 12) - In 2025, this is still 'semifinal' type
        self.stdout.write("\n--- Upper Bracket Finals ---")
        match, upper_finalist, upper_loser = create_playoff_match(
            upper_sf_winners[0], upper_sf_winners[1], "semifinal", 12, 1
        )
        self.stdout.write(
            f"UBF (Set 12, Match 1): Alliance {upper_sf_winners[0]['number']} vs Alliance {upper_sf_winners[1]['number']} -> Winner: Alliance {upper_finalist['number']}"
        )

        # Grand Finals (Set 13) - Best of 3 series
        self.stdout.write("\n--- Grand Finals (Best of 3) ---")
        upper_wins = 0
        lower_wins = 0
        champion = None

        for match_num in range(1, 4):  # Up to 3 matches
            match, winner, loser = create_playoff_match(
                upper_finalist, lower_finalist, "final", 13, match_num
            )

            if winner == upper_finalist:
                upper_wins += 1
            else:
                lower_wins += 1

            self.stdout.write(
                f"GF{match_num} (Set 13, Match {match_num}): Alliance {upper_finalist['number']} vs Alliance {lower_finalist['number']} -> Winner: Alliance {winner['number']} (Score: {upper_wins}-{lower_wins})"
            )

            # Check if we have a champion (first to 2 wins)
            if upper_wins == 2:
                champion = upper_finalist
                runner_up = lower_finalist
                break
            elif lower_wins == 2:
                champion = lower_finalist
                runner_up = upper_finalist
                break

        self.stdout.write(
            self.style.SUCCESS(f"\n🏆 CHAMPION: Alliance {champion['number']} 🏆")
        )
        self.stdout.write(
            f"   Teams: {champion['teams'][0].number}, {champion['teams'][1].number}, {champion['teams'][2].number}"
        )

        # Count playoff matches
        playoff_matches = Match.objects.filter(
            competition=competition,
            match_type__in=["quarterfinal", "semifinal", "final"],
        ).count()

        self.stdout.write(
            self.style.SUCCESS(f'\n✓ Competition "{comp_name}" generated successfully!')
        )
        self.stdout.write(f"  - {num_teams} teams")
        self.stdout.write(f"  - {total_qual_matches} qualification matches")
        self.stdout.write(f"  - {playoff_matches} playoff matches (double elimination)")
        self.stdout.write(f"  - Teams ranked by performance with power scaling")
