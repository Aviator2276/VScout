from django.core.management.base import BaseCommand

from backend.models import Competition, Match
from backend.utils.video_downloader import clip_match_video


class Command(BaseCommand):
    help = "Re-clip match videos for a competition"

    def add_arguments(self, parser):
        parser.add_argument("competition_code", type=str)
        parser.add_argument(
            "--match",
            type=int,
            help="Only re-clip a specific match number",
        )

    def handle(self, *args, **options):
        code = options["competition_code"]
        try:
            competition = Competition.objects.get(code=code)
        except Competition.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"Competition '{code}' not found"))
            return

        qs = Match.objects.filter(competition=competition, video_available=True, match_type="qualification")
        if options["match"]:
            qs = qs.filter(match_number=options["match"])
        qs = qs.order_by("match_number")

        self.stdout.write(f"Re-clipping {qs.count()} match(es) for {code}...")

        for match in qs:
            self.stdout.write(f"  Match {match.match_number}... ", ending="")
            match.video_clipped = False
            match.save(update_fields=["video_clipped"])

            success = clip_match_video(match)
            if success:
                self.stdout.write(self.style.SUCCESS("OK"))
            else:
                self.stdout.write(self.style.ERROR("FAILED"))

        self.stdout.write(self.style.SUCCESS("Done."))
