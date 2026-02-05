import random

from django.core.management.base import BaseCommand

from backend.models import Competition, Match, Team, TeamInfo


class Command(BaseCommand):
    help = "Set up a competition with teams and unplayed matches (for step-through simulation)"

    TEAM_NAMES = [
        "Robo Raptors",
        "Cyber Crushers",
        "Voltage Vipers",
        "Steel Stallions",
        "Circuit Breakers",
        "Quantum Quokkas",
        "Titanium Titans",
        "Electric Eagles",
        "Neon Ninjas",
        "Plasma Panthers",
        "Turbo Tigers",
        "Atomic Ants",
        "Binary Bots",
        "Cyber Cyclones",
        "Data Dragons",
        "Electron Elites",
        "Fusion Force",
        "Gear Grinders",
        "Hydraulic Hawks",
        "Iron Impalas",
        "Kinetic Knights",
        "Laser Llamas",
        "Mecha Mustangs",
        "Nuclear Narwhals",
        "Omega Otters",
        "Photon Phoenix",
        "Quantum Quasars",
        "Rocket Rhinos",
        "Silicon Sharks",
        "Techno Tornadoes",
        "Bolt Brigade",
        "CircuitRunners Robotics",
        "Ohm's Outlaws",
        "Engineering Eagles",
        "Watt Warriors",
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            "--name", type=str, default="Test Competition 2026", help="Competition name"
        )
        parser.add_argument(
            "--code", type=str, default="TEST2026", help="Competition code"
        )
        parser.add_argument("--teams", type=int, default=30, help="Number of teams")
        parser.add_argument(
            "--matches", type=int, default=50, help="Number of qualification matches"
        )

    def handle(self, *args, **options):
        comp_name = options["name"]
        comp_code = options["code"]
        num_teams = options["teams"]
        num_matches = options["matches"]

        self.stdout.write(self.style.SUCCESS(f"\n=== Setting up {comp_name} ==="))

        # Clear existing data
        if Competition.objects.filter(code=comp_code).exists():
            self.stdout.write(
                self.style.WARNING(f"Clearing existing competition {comp_code}...")
            )
            Competition.objects.filter(code=comp_code).delete()

        # Create competition
        competition = Competition.objects.create(name=comp_name, code=comp_code)
        self.stdout.write(
            self.style.SUCCESS(f"✓ Created competition: {comp_name} ({comp_code})")
        )

        # Create teams
        self.stdout.write(f"\nCreating {num_teams} teams...")
        teams = []
        team_names = self.TEAM_NAMES.copy()
        random.shuffle(team_names)

        for i in range(num_teams):
            team_number = 1000 + i
            team_name = team_names[i] if i < len(team_names) else f"Team {team_number}"

            team = Team.objects.create(number=team_number, name=team_name)
            teams.append(team)

            # Create TeamInfo entry
            TeamInfo.objects.create(
                team=team,
                competition=competition,
                rank=0,  # Will be calculated after matches
            )

        self.stdout.write(self.style.SUCCESS(f"✓ Created {len(teams)} teams"))

        # Create qualification matches (unplayed)
        self.stdout.write(f"\nCreating {num_matches} qualification matches...")

        for match_num in range(1, num_matches + 1):
            # Randomly select 6 different teams
            selected_teams = random.sample(teams, 6)

            Match.objects.create(
                competition=competition,
                match_type="qualification",
                match_number=match_num,
                set_number=1,
                has_played=False,
                blue_team_1=selected_teams[0],
                blue_team_2=selected_teams[1],
                blue_team_3=selected_teams[2],
                red_team_1=selected_teams[3],
                red_team_2=selected_teams[4],
                red_team_3=selected_teams[5],
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Created {num_matches} unplayed qualification matches"
            )
        )

        # Summary
        self.stdout.write(self.style.SUCCESS("\n=== Setup Complete! ==="))
        self.stdout.write(f"Competition: {comp_name} ({comp_code})")
        self.stdout.write(f"Teams: {num_teams}")
        self.stdout.write(f"Qualification Matches: {num_matches} (unplayed)")
        self.stdout.write("\nNext steps:")
        self.stdout.write(
            "  1. make comp-day1     - Play first half of qualification matches"
        )
        self.stdout.write(
            "  2. make comp-day2     - Play second half of qualification matches"
        )
        self.stdout.write("  3. make comp-select-* - Alliance selection (3 rounds)")
        self.stdout.write("  4. make comp-quarters - Quarterfinal matches")
        self.stdout.write("  5. make comp-semis    - Semifinal matches")
        self.stdout.write("  6. make comp-finals   - Finals matches")
