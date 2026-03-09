from django.core.management.base import BaseCommand

from backend.models import Competition, Match
from backend.utils.video_downloader import download_match_video


class Command(BaseCommand):
    help = "Re-download match videos for a competition, resetting video_available and video_clipped"

    def add_arguments(self, parser):
        parser.add_argument("competition_code", type=str)
        parser.add_argument(
            "--match",
            type=int,
            help="Only re-download a specific match number",
        )
        parser.add_argument(
            "--buffer",
            type=int,
            default=30,
            help="Buffer seconds before/after match (default: 30)",
        )

    def handle(self, *args, **options):
        code = options["competition_code"]
        try:
            competition = Competition.objects.get(code=code)
        except Competition.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"Competition '{code}' not found"))
            return

        qs = Match.objects.filter(competition=competition, has_played=True, match_type="qualification")
        if options["match"]:
            qs = qs.filter(match_number=options["match"])
        qs = qs.order_by("match_number")

        self.stdout.write(f"Re-downloading {qs.count()} match(es) for {code}...")

        for match in qs:
            self.stdout.write(f"  Match {match.match_number}... ", ending="")
            match.video_available = False
            match.video_clipped = False
            match.save(update_fields=["video_available", "video_clipped"])

            success = download_match_video(match, buffer=options["buffer"])
            if success:
                self.stdout.write(self.style.SUCCESS("OK"))
            else:
                self.stdout.write(self.style.ERROR("FAILED"))

        self.stdout.write(self.style.SUCCESS("Done."))
