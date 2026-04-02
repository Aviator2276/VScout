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
        parser.add_argument("--obs-recording", help="Path to local OBS recording file (overrides OBS_RECORDING_PATH env var)")
        parser.add_argument("--obs-recording-dir", help="Path to folder of OBS segment files (e.g. obs_recording_albany/)")
        parser.add_argument("--first-match-video-pos", type=int, default=0, help="Seconds into the first segment where match 1 starts (e.g. 294 for 4:54)")

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

        import os
        obs_recording_dir = options.get("obs_recording_dir") or os.environ.get("OBS_RECORDING_DIR", "").strip()
        obs_recording = options.get("obs_recording") or os.environ.get("OBS_RECORDING_PATH", "").strip()

        if obs_recording_dir:
            self.stdout.write(f"OBS segment mode: using folder {obs_recording_dir}")
        elif obs_recording:
            self.stdout.write(f"OBS mode: using local recording {obs_recording}")

        first_match_video_pos = options.get("first_match_video_pos", 0)

        keep_temp = options.get("keep_temp", False)
        for match in matches:
            self._process_match(match, server, headers, keep_temp=keep_temp, obs_recording=obs_recording, obs_recording_dir=obs_recording_dir, first_match_video_pos=first_match_video_pos)

    def _process_match(self, match, server, headers, keep_temp=False, obs_recording=None, obs_recording_dir=None, first_match_video_pos=0):
        match_id = match["match_id"]
        comp = match["competition_code"]
        num = match["match_number"]
        self.stdout.write(f"\nProcessing match {num} ({comp})...")

        work_dir = Path(tempfile.mkdtemp(prefix=f"offsite_{comp}_{num}_"))
        raw_path = work_dir / f"match_{num}_raw.mp4"
        self.stdout.write(f"  Work dir: {work_dir}")

        try:
            if obs_recording_dir:
                # OBS segment dir mode: find the right segment file
                match_time = match.get("start_match_time", 0)
                first_match_time = match.get("first_match_start_time", 0)
                if not match_time or not first_match_time:
                    match_time, first_match_time = self._fetch_times_from_tba(match)
                if not match_time or not first_match_time:
                    self.stdout.write(f"  Missing match times — skipping")
                    return
                buffer = 30
                seg_path, offset_in_seg = self._find_segment_for_match(
                    obs_recording_dir, match_time, first_match_time, first_match_video_pos
                )
                if not seg_path:
                    self.stdout.write(f"  Could not find segment for match {num} — skipping")
                    return
                video_start = max(0, offset_in_seg - buffer)
                clip_duration = 150 + (2 * buffer)
                if not self._clip_from_segments(obs_recording_dir, seg_path, video_start, clip_duration, raw_path):
                    self.stderr.write(f"  OBS segment clip failed")
                    return
            elif obs_recording:
                # OBS mode: clip directly from single local recording
                first_match_time = match.get("first_match_start_time", 0)
                match_time = match.get("start_match_time", 0)
                if not match_time or not first_match_time:
                    match_time, first_match_time = self._fetch_times_from_tba(match)
                if not match_time or not first_match_time:
                    self.stdout.write(f"  Missing start_match_time or first_match_start_time — skipping")
                    return
                buffer = 30
                video_start = max(0, (match_time - first_match_time) + first_match_video_pos - buffer)
                clip_duration = 150 + (2 * buffer)
                self.stdout.write(f"  Clipping from OBS recording at {video_start:.1f}s...")
                if not self._clip_from_obs(obs_recording, video_start, clip_duration, raw_path):
                    self.stderr.write(f"  OBS clip failed")
                    return
            else:
                # YouTube stream mode
                stream_url, video_start = self._get_stream_info(match)
                if not stream_url:
                    self.stdout.write(f"  No stream link or OBS recording available — skipping")
                    return
                if video_start <= 0:
                    self.stdout.write(f"  No start_match_time or offset — skipping")
                    return
                self.stdout.write(f"  Downloading from {stream_url} at {video_start:.0f}s...")
                if not self._download(stream_url, video_start, raw_path):
                    self.stderr.write(f"  Download failed")
                    return

            # 2. Clip to match start
            self.stdout.write(f"  Clipping to match start...")
            if not self._clip(raw_path):
                self.stderr.write(f"  Clip failed — could not find 0:19 timer")
                return

            # 3. Upload clipped video
            size_mb = raw_path.stat().st_size / (1024 * 1024)
            self.stdout.write(f"  Uploading video to server ({size_mb:.1f} MB)...")
            with open(raw_path, "rb") as f:
                upload_resp = requests.post(
                    f"{server}/api/offsite/upload-video/{match_id}",
                    files={"video": (raw_path.name, f, "video/mp4")},
                    headers=headers,
                    timeout=300,
                )
            if upload_resp.status_code != 200:
                self.stderr.write(f"  Video upload failed: {upload_resp.status_code} {upload_resp.text}")
                return

            # 4. LLM OCR
            self.stdout.write(f"  Running LLM OCR...")
            fuel_timeline = self._ocr(raw_path)
            if not fuel_timeline:
                self.stderr.write(f"  OCR failed")
                return

            # 5. Submit to main server
            self.stdout.write(f"  Submitting fuel_timeline to server...")
            resp = requests.post(
                f"{server}/api/offsite/submit/{match_id}",
                json={"fuel_timeline": fuel_timeline},
                headers=headers,
                timeout=60,
            )
            if resp.status_code != 200:
                self.stderr.write(f"  Submit failed: {resp.status_code} {resp.text}")
                return

            self.stdout.write(self.style.SUCCESS(f"  Done — match {num} ({comp})"))

        finally:
            if keep_temp:
                self.stdout.write(f"  Kept temp dir: {work_dir}")
            else:
                shutil.rmtree(work_dir, ignore_errors=True)

    def _find_segment_for_match(self, obs_dir, match_time, first_match_time, first_match_video_pos):
        """
        Find which segment file contains a match and the offset within it.

        Returns (segment_path, offset_seconds) or (None, 0) if not found.

        Segments are named like '2026-04-01 14-58-43.mp4'. The first segment's
        first_match_video_pos tells us where match 1 sits in the timeline.
        All other matches are located by their TBA actual_time difference from match 1.
        """
        from datetime import datetime

        segments = []
        for f in sorted(Path(obs_dir).glob("*.mp4")):
            try:
                dt = datetime.strptime(f.stem, "%Y-%m-%d %H-%M-%S")
                segments.append((dt, f))
            except ValueError:
                continue

        if not segments:
            self.stderr.write(f"  No segment files found in {obs_dir}")
            return None, 0

        first_seg_dt = segments[0][0]

        # seconds into the full recording where this match starts
        match_seconds = (match_time - first_match_time) + first_match_video_pos

        # find the segment that contains match_seconds
        for i, (seg_dt, seg_path) in enumerate(segments):
            seg_start = (seg_dt - first_seg_dt).total_seconds()
            if i + 1 < len(segments):
                seg_end = (segments[i + 1][0] - first_seg_dt).total_seconds()
            else:
                seg_end = float("inf")

            if seg_start <= match_seconds < seg_end:
                offset = match_seconds - seg_start
                self.stdout.write(f"  Match at {match_seconds:.1f}s -> {seg_path.name} offset {offset:.1f}s")
                return seg_path, offset

        self.stderr.write(f"  No segment covers {match_seconds:.1f}s into recording")
        return None, 0

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

    def _fetch_times_from_tba(self, match):
        """Fetch actual_time for this match and first match of competition directly from TBA."""
        import os
        tba_key = os.getenv("TBA_API_KEY", "")
        if not tba_key:
            return 0, 0
        comp = match["competition_code"]
        num = match["match_number"]
        match_type = match.get("match_type", "qualification")
        type_code = {"qualification": "qm", "quarterfinal": "qf", "semifinal": "sf", "final": "f"}.get(match_type, "qm")
        headers = {"X-TBA-Auth-Key": tba_key}
        try:
            # Fetch this match's actual_time
            resp = requests.get(f"https://www.thebluealliance.com/api/v3/match/{comp}_{type_code}{num}", headers=headers, timeout=10)
            match_time = (resp.json().get("actual_time") or 0) if resp.status_code == 200 else 0

            # Fetch match 1's actual_time as the first match reference
            resp1 = requests.get(f"https://www.thebluealliance.com/api/v3/match/{comp}_qm1", headers=headers, timeout=10)
            first_match_time = (resp1.json().get("actual_time") or 0) if resp1.status_code == 200 else 0

            if match_time and first_match_time:
                self.stdout.write(f"  Fetched times from TBA: match={match_time}, first={first_match_time}")
            return match_time, first_match_time
        except Exception as e:
            logger.error(f"TBA time fetch failed: {e}")
            return 0, 0

    def _clip_from_segments(self, obs_dir, seg_path, video_start, clip_duration, output_path):
        """Clip from one or two consecutive segment files, concatenating if the clip spans a boundary."""
        import subprocess
        from datetime import datetime

        seg_dur = float(subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", str(seg_path)],
            capture_output=True, text=True
        ).stdout.strip() or 0)

        remaining_in_seg = seg_dur - video_start

        if remaining_in_seg >= clip_duration:
            # Entire clip fits in one segment
            self.stdout.write(f"  Clipping from {seg_path.name} at {video_start:.1f}s...")
            return self._clip_from_obs(str(seg_path), video_start, clip_duration, output_path)

        # Need to span into next segment — find it
        segments = sorted(
            [(datetime.strptime(f.stem, "%Y-%m-%d %H-%M-%S"), f)
             for f in Path(obs_dir).glob("*.mp4")
             if self._parse_seg_dt(f.stem) is not None],
            key=lambda x: x[0]
        )
        seg_names = [str(f) for _, f in segments]
        try:
            idx = seg_names.index(str(seg_path))
        except ValueError:
            self.stdout.write(f"  Clipping from {seg_path.name} at {video_start:.1f}s (no next segment)...")
            return self._clip_from_obs(str(seg_path), video_start, clip_duration, output_path)

        if idx + 1 >= len(segments):
            self.stdout.write(f"  Clipping from {seg_path.name} at {video_start:.1f}s (last segment)...")
            return self._clip_from_obs(str(seg_path), video_start, clip_duration, output_path)

        next_seg_path = segments[idx + 1][1]
        need_from_next = clip_duration - remaining_in_seg
        self.stdout.write(f"  Clipping across {seg_path.name} + {next_seg_path.name}...")

        part1 = output_path.with_suffix(".part1.mp4")
        part2 = output_path.with_suffix(".part2.mp4")
        concat_list = output_path.with_suffix(".concat.txt")
        try:
            if not self._clip_from_obs(str(seg_path), video_start, remaining_in_seg, part1):
                return False
            if not self._clip_from_obs(str(next_seg_path), 0, need_from_next, part2):
                return False
            concat_list.write_text(f"file '{part1}'\nfile '{part2}'\n")
            cmd = [
                "ffmpeg", "-f", "concat", "-safe", "0",
                "-i", str(concat_list),
                "-c", "copy", "-y", str(output_path),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"ffmpeg concat failed: {result.stderr}")
                return False
            return output_path.exists()
        finally:
            part1.unlink(missing_ok=True)
            part2.unlink(missing_ok=True)
            concat_list.unlink(missing_ok=True)

    def _parse_seg_dt(self, stem):
        from datetime import datetime
        try:
            return datetime.strptime(stem, "%Y-%m-%d %H-%M-%S")
        except ValueError:
            return None

    def _clip_from_obs(self, recording_path, video_start, clip_duration, output_path):
        """Clip a segment from a local OBS recording using ffmpeg."""
        cmd = [
            "ffmpeg",
            "-ss", str(video_start),
            "-i", str(recording_path),
            "-t", str(clip_duration),
            "-vf", "scale=1280:720",
            "-c:v", "libx264",
            "-c:a", "aac",
            "-y",
            "-stats",
            str(output_path),
        ]
        result = subprocess.run(cmd, stderr=None)  # let ffmpeg stats print to terminal
        if result.returncode != 0:
            logger.error(f"ffmpeg OBS clip failed")
        return result.returncode == 0 and output_path.exists()

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
                ("red",  "83:25:45:333",  str(red_dir / "%03d.jpg")),
                ("blue", "83:25:512:333", str(blue_dir / "%03d.jpg")),
            ]
            for alliance, crop, out_pattern in crops:
                w, h, x, y = crop.split(":")
                cmd = [
                    "ffmpeg", "-i", str(video_path),
                    "-vf", f"scale=640:360,crop={w}:{h}:{x}:{y},scale={int(w)*32}:{int(h)*32},fps=1",
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
