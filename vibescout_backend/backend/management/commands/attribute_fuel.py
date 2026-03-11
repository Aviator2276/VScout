"""
Management command to attribute fuel scored to individual robots for scouted matches.

Usage:
    python manage.py attribute_fuel                             # all competitions
    python manage.py attribute_fuel 2026week0                  # specific competition
    python manage.py attribute_fuel 2026week0 --async          # queue as background tasks
    python manage.py attribute_fuel 2026week0 --match 1        # specific match, run + show timeline
    python manage.py attribute_fuel 2026week0 --match 1 --alliance blue
"""

from django.core.management.base import BaseCommand

from backend.models import Competition, Match, RobotAction


SCORE_LOOKAHEAD = 8  # must match tasks.py


class Command(BaseCommand):
    help = "Attribute fuel scored to individual robots using fuel timeline + scouted actions"

    def add_arguments(self, parser):
        parser.add_argument(
            "competition_code",
            nargs="?",
            help="Competition code (default: all competitions)",
        )
        parser.add_argument(
            "--async",
            action="store_true",
            dest="async_mode",
            help="Queue as background django-q tasks instead of running directly",
        )
        parser.add_argument(
            "--match",
            type=int,
            dest="match_number",
            help="Show second-by-second timeline for a specific match number",
        )
        parser.add_argument(
            "--alliance",
            choices=["blue", "red", "both"],
            default="both",
            help="Which alliance to show timeline for (default: both)",
        )

    def handle(self, *args, **options):
        competition_code = options.get("competition_code")
        async_mode = options.get("async_mode")
        match_number = options.get("match_number")
        alliance_filter = options.get("alliance")

        matches_qs = Match.objects.filter(fuel_timeline__isnull=False)
        if competition_code:
            try:
                competition = Competition.objects.get(code=competition_code)
            except Competition.DoesNotExist:
                self.stderr.write(f"Competition '{competition_code}' not found")
                return
            matches_qs = matches_qs.filter(competition=competition)

        if match_number:
            matches_qs = matches_qs.filter(match_number=match_number)

        matches = list(matches_qs.order_by("competition__code", "match_number"))

        if match_number:
            # Timeline debug mode
            for match in matches:
                alliances = []
                if alliance_filter in ("blue", "both"):
                    alliances.append("blue")
                if alliance_filter in ("red", "both"):
                    alliances.append("red")
                for alliance in alliances:
                    self._print_timeline(match, alliance)
            return

        self.stdout.write(f"Found {len(matches)} matches with fuel timeline")
        processed = 0
        skipped = 0

        for match in matches:
            blue_teams = [match.blue_team_1, match.blue_team_2, match.blue_team_3]
            red_teams = [match.red_team_1, match.red_team_2, match.red_team_3]

            blue_scouted = sum(
                1 for t in blue_teams
                if RobotAction.objects.filter(match=match, team=t).exists()
            )
            red_scouted = sum(
                1 for t in red_teams
                if RobotAction.objects.filter(match=match, team=t).exists()
            )

            if blue_scouted < 3 and red_scouted < 3:
                self.stdout.write(
                    f"  Match {match.match_number} ({match.competition.code}): "
                    f"blue {blue_scouted}/3, red {red_scouted}/3 — skipping"
                )
                skipped += 1
                continue

            self.stdout.write(
                f"  Match {match.match_number} ({match.competition.code}): "
                f"blue {blue_scouted}/3, red {red_scouted}/3"
            )

            if async_mode:
                from django_q.tasks import async_task
                async_task(
                    "backend.tasks.attribute_fuel_to_robots_task",
                    match.pk,
                    task_name=f"fuel_attribution_{match.competition.code}_match_{match.match_number}",
                )
                self.stdout.write(f"    → Queued")
            else:
                from backend.tasks import attribute_fuel_to_robots_task
                result = attribute_fuel_to_robots_task(match.pk)
                if result.get("success"):
                    updates = result.get("updates", {})
                    if updates:
                        self.stdout.write(f"    → {updates}")
                    else:
                        self.stdout.write(f"    → {result.get('message', 'done')}")
                else:
                    self.stderr.write(f"    → Error: {result.get('error')}")

            processed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone: {processed} processed, {skipped} skipped (not fully scouted)"
            )
        )

    def _print_timeline(self, match, alliance):
        def parse_score(s):
            try:
                return int(s)
            except (ValueError, TypeError):
                return None

        if alliance == "blue":
            teams = [match.blue_team_1, match.blue_team_2, match.blue_team_3]
            positions = ["blue_1", "blue_2", "blue_3"]
        else:
            teams = [match.red_team_1, match.red_team_2, match.red_team_3]
            positions = ["red_1", "red_2", "red_3"]

        scouted = sum(
            1 for t in teams
            if RobotAction.objects.filter(match=match, team=t).exists()
        )
        team_numbers = [t.number for t in teams]

        self.stdout.write(
            f"\n{'='*70}\n"
            f"Match {match.match_number} ({match.competition.code}) — {alliance.upper()} alliance\n"
            f"Teams: {team_numbers[0]} ({positions[0]}), "
            f"{team_numbers[1]} ({positions[1]}), "
            f"{team_numbers[2]} ({positions[2]})\n"
            f"Scouted: {scouted}/3 | Lookahead: {SCORE_LOOKAHEAD}s"
        )

        if scouted < 3:
            self.stdout.write("  Not fully scouted — skipping timeline")
            return

        timeline = match.fuel_timeline.get(alliance, [])
        if not timeline:
            self.stdout.write("  No timeline data")
            return

        raw = [parse_score(s) for s in timeline]
        last_valid = 0
        parsed_scores = []
        for s in raw:
            if s is not None:
                last_valid = s
            parsed_scores.append(last_valid)

        actions_by_team = {}
        for team in teams:
            actions_by_team[team.pk] = list(
                RobotAction.objects.filter(match=match, team=team).values(
                    "action_type", "start_time", "end_time"
                )
            )

        # Header
        t0, t1, t2 = team_numbers
        self.stdout.write(f"\n{'Sec':>4}  {'Score':>6}  {'Delta':>6}  "
                          f"{'#'+str(t0):>8}  {'#'+str(t1):>8}  {'#'+str(t2):>8}  Note")
        self.stdout.write("-" * 70)

        total_attributed = 0
        total_orphaned = 0
        fuel_per_pos = {pos: 0.0 for pos in positions}

        prev_score = parsed_scores[0] if parsed_scores else 0
        for sec_idx, score in enumerate(parsed_scores[1:], start=1):
            delta = score - prev_score
            prev_score = score

            if delta <= 0:
                continue

            period = "AUTO" if sec_idx < 15 else "tele"
            window_start = sec_idx - SCORE_LOOKAHEAD

            shooting = []
            for team, pos in zip(teams, positions):
                for action in actions_by_team[team.pk]:
                    if (
                        action["action_type"] == "shooting"
                        and float(action["start_time"]) <= sec_idx
                        and float(action["end_time"]) > window_start
                    ):
                        shooting.append((pos, team.number))
                        break

            cols = []
            for pos, num in zip(positions, team_numbers):
                if any(p == pos for p, _ in shooting):
                    cols.append(f"{'SHOOT':>8}")
                else:
                    cols.append(f"{'':>8}")

            if not shooting:
                note = self.style.WARNING(f"ORPHAN +{delta}")
                total_orphaned += delta
            else:
                share = delta / len(shooting)
                shooters = "+".join(str(n) for _, n in shooting)
                note = f"→ {shooters} each +{share:.1f}"
                total_attributed += delta
                for pos, _ in shooting:
                    fuel_per_pos[pos] += share

            self.stdout.write(
                f"{sec_idx:>4}  {score:>6}  {'+'+str(delta):>6}  "
                f"{cols[0]}  {cols[1]}  {cols[2]}  {period} {note}"
            )

        self.stdout.write("-" * 70)
        self.stdout.write(
            f"Attributed: {total_attributed}  |  "
            f"Orphaned: {self.style.WARNING(str(total_orphaned))}  |  "
            f"Total deltas: {total_attributed + total_orphaned}"
        )
        for pos, num in zip(positions, team_numbers):
            self.stdout.write(f"  #{num} ({pos}): {round(fuel_per_pos[pos])} fuel")
