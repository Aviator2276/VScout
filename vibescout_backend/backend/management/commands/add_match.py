import os
from pathlib import Path

import tbapy
from django.core.management.base import BaseCommand
from dotenv import load_dotenv

from backend.utils.match_utils import add_match_from_tba


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
            add_match_from_tba(
                tba, competition_code, match_number, match_type, set_number, self.stdout
            )
            self.stdout.write(self.style.SUCCESS(f"\n✓ Successfully added match"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error adding match: {str(e)}"))
            raise
