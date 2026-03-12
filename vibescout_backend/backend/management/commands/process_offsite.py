"""
Offsite processing command — runs on a separate machine to handle the heavy work:
  1. Fetches pending matches from the main server
  2. Downloads video from the stream
  3. Clips to match start (0:19 timer detection)
  4. Runs LLM OCR to produce fuel_timeline
  5. POSTs the fuel_timeline back to the main server

Usage:
    python manage.py process_offsite --server https://main-server.com --key YOUR_API_KEY
    python manage.py process_offsite --server https://main-server.com --key YOUR_API_KEY --competition 2026gadal
    python manage.py process_offsite --server https://main-server.com --key YOUR_API_KEY --match-id 42
"""

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

import requests
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Download, clip, OCR and push fuel timelines to the main server"

    def add_arguments(self, parser):
        parser.add_argument("--server", required=True, help="Main server base URL (e.g. https://vibescout.example.com)")
        parser.add_argument("--key", required=True, help="OFFSITE_API_KEY value")
        parser.add_argument("--competition", help="Only process matches for this competition code")
        parser.add_argument("--match-number", type=int, help="Only process a specific match number")
        parser.add_argument("--keep-temp", action="store_true", help="Keep temp work dir after processing (for debugging)")

    def handle(self, *args, **options):
        server = options["server"].rstrip("/")
        key = options["key"]
        headers = {"X-Offsite-Key": key}

        # Fetch pending matches
        self.stdout.write(f"Fetching pending matches from {server}...")
        resp = requests.get(f"{server}/api/offsite/pending", headers=headers, timeout=30)
        if resp.status_code != 200:
            self.stderr.write(f"Failed to fetch pending matches: {resp.status_code} {resp.text}")
            return

        matches = resp.json()

        if options.get("competition"):
            matches = [m for m in matches if m["competition_code"] == options["competition"]]
        if options.get("match_number"):
            matches = [m for m in matches if m["match_number"] == options["match_number"]]

        self.stdout.write(f"Found {len(matches)} match(es) to process")

        keep_temp = options.get("keep_temp", False)
        for match in matches:
            self._process_match(match, server, headers, keep_temp=keep_temp)

    def _process_match(self, match, server, headers, keep_temp=False):
        match_id = match["match_id"]
        comp = match["competition_code"]
        num = match["match_number"]
        self.stdout.write(f"\nProcessing match {num} ({comp})...")

        # Determine stream URL and compute video start time
        stream_url, video_start = self._get_stream_info(match)
        if not stream_url:
            self.stdout.write(f"  No stream link available — skipping")
            return
        if video_start <= 0:
            self.stdout.write(f"  No start_match_time or offset — skipping")
            return

        work_dir = Path(tempfile.mkdtemp(prefix=f"offsite_{comp}_{num}_"))
        raw_path = work_dir / f"match_{num}_raw.mp4"
        self.stdout.write(f"  Work dir: {work_dir}")

        try:
            # 1. Download
            self.stdout.write(f"  Downloading from {stream_url} at {video_start:.0f}s...")
            if not self._download(stream_url, video_start, raw_path):
                self.stderr.write(f"  Download failed")
                return

            # 2. Clip to match start
            self.stdout.write(f"  Clipping to match start...")
            if not self._clip(raw_path):
                self.stderr.write(f"  Clip failed — could not find 0:19 timer")
                return

            # 3. LLM OCR
            self.stdout.write(f"  Running LLM OCR...")
            fuel_timeline = self._ocr(raw_path)
            if not fuel_timeline:
                self.stderr.write(f"  OCR failed")
                return

            # 4. Submit to main server
            self.stdout.write(f"  Submitting fuel_timeline to server...")
            resp = requests.post(
                f"{server}/api/offsite/submit/{match_id}",
                json={"fuel_timeline": fuel_timeline},
                headers=headers,
                timeout=60,
            )
            if resp.status_code == 200:
                self.stdout.write(self.style.SUCCESS(f"  Done — match {num} ({comp})"))
            else:
                self.stderr.write(f"  Submit failed: {resp.status_code} {resp.text}")

        finally:
            if keep_temp:
                self.stdout.write(f"  Kept temp dir: {work_dir}")
            else:
                shutil.rmtree(work_dir, ignore_errors=True)

    def _get_stream_info(self, match):
        """Return (stream_url, video_start_seconds) for the match."""
        start_time = match["start_match_time"]
        days = [
            (match["stream_link_day_1"], match["offset_day_1"]),
            (match["stream_link_day_2"], match["offset_day_2"]),
            (match["stream_link_day_3"], match["offset_day_3"]),
        ]
        for stream_url, offset in days:
            if stream_url and offset and start_time:
                video_start = start_time - offset - 30  # 30s buffer before match
                if video_start >= 0:
                    return stream_url, video_start
        return None, 0

    def _download(self, stream_url, video_start, output_path):
        """Download ~240s of stream starting at video_start seconds."""
        cmd = [
            "yt-dlp",
            "--no-warnings",
            "--format", "best",
            "--download-sections", f"*{video_start:.0f}-{video_start + 240:.0f}",
            "--force-keyframes-at-cuts",
            "-o", str(output_path),
            stream_url,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0 and output_path.exists()

    def _clip(self, video_path):
        """Clip to match start in-place using timer detection. Returns True on success."""
        from backend.utils.video_downloader import clip_match_video

        class FakeMatch:
            """Minimal object for clip_match_video compatibility."""
            def __init__(self, path):
                self._path = path
                self.match_number = path.stem
                self.video_clipped = False
                self.video_available = True

            def save(self, *args, **kwargs):
                pass

        class FakeCompetition:
            code = "offsite"

        fake = FakeMatch(video_path)
        fake.competition = FakeCompetition()

        # Monkey-patch _get_video_path to return our path
        import backend.utils.video_downloader as vd
        original = vd._get_video_path
        vd._get_video_path = lambda *args, **kwargs: video_path
        try:
            success = clip_match_video(fake)
        finally:
            vd._get_video_path = original

        return success

    def _ocr(self, video_path):
        """Run LLM OCR on clipped video. Returns fuel_timeline dict or None."""
        from backend.utils.fuel_count_llm import scores_from_images

        tmp = Path(tempfile.mkdtemp(prefix="ocr_"))
        try:
            red_dir = tmp / "red"
            blue_dir = tmp / "blue"
            red_dir.mkdir()
            blue_dir.mkdir()

            crops = [
                ("blue", "83:25:45:333",  str(blue_dir / "%03d.jpg")),
                ("red",  "83:25:512:333", str(red_dir / "%03d.jpg")),
            ]
            for alliance, crop, out_pattern in crops:
                w, h, x, y = crop.split(":")
                cmd = [
                    "ffmpeg", "-i", str(video_path),
                    "-vf", f"crop={w}:{h}:{x}:{y},scale={int(w)*32}:{int(h)*32},fps=1",
                    "-f", "image2", "-q:v", "2",
                    out_pattern, "-y", "-loglevel", "error",
                ]
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    logger.error(f"ffmpeg crop failed for {alliance}: {result.stderr}")
                    return None

            return scores_from_images(str(tmp))
        except Exception as e:
            logger.error(f"OCR error: {e}")
            return None
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
