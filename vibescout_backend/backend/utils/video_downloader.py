"""Utility functions for downloading match videos"""

import logging
import platform
import subprocess
from pathlib import Path

import yt_dlp

logger = logging.getLogger(__name__)


def download_match_video(match, buffer=30, output_dir="match_videos"):
    """
    Download a single match video clip from YouTube stream.

    Args:
        match: Match instance to download video for
        buffer: Buffer time in seconds before/after match (default: 30)
        output_dir: Output directory for downloaded videos (default: 'match_videos')

    Returns:
        bool: True if download was successful, False otherwise
    """
    logger.info(
        f"Starting video download for match {match.match_number} "
        f"({match.competition.code})"
    )

    competition = match.competition

    # Check if stream links are configured
    if not any(
        [
            competition.stream_link_day_1,
            competition.stream_link_day_2,
            competition.stream_link_day_3,
        ]
    ):
        logger.warning(
            f"No stream links configured for competition {competition.code}, "
            f"skipping video download for match {match.match_number}"
        )
        return False

    # Check if match has start time
    if match.start_match_time <= 0:
        logger.warning(
            f"Match {match.match_number} has no start_match_time, skipping video download"
        )
        return False

    # Create output directory
    output_path = (
        Path(__file__).resolve().parent.parent.parent / output_dir / competition.code
    )
    output_path.mkdir(parents=True, exist_ok=True)
    logger.info(f"Output directory: {output_path}")

    # Get first match to calculate day boundaries
    from backend.models import Match

    first_match = (
        Match.objects.filter(competition=competition, start_match_time__gt=0)
        .order_by("start_match_time")
        .first()
    )

    if not first_match:
        logger.error(
            f"No matches with start_match_time found for competition {competition.code}"
        )
        return False

    first_match_time = first_match.start_match_time
    day_1_end = first_match_time + (12 * 3600)  # 12 hours after first match
    day_2_end = day_1_end + (24 * 3600)  # 24 hours after day 1 end

    # Determine which day's stream to use
    match_time = match.start_match_time

    if match_time < day_1_end:
        day = 1
        stream_link = competition.stream_link_day_1
        offset = competition.offset_stream_time_to_unix_timestamp_day_1
    elif match_time < day_2_end:
        day = 2
        stream_link = competition.stream_link_day_2
        offset = competition.offset_stream_time_to_unix_timestamp_day_2
    else:
        day = 3
        stream_link = competition.stream_link_day_3
        offset = competition.offset_stream_time_to_unix_timestamp_day_3

    logger.info(f"Match {match.match_number} determined to be on day {day}")

    if not stream_link:
        logger.warning(
            f"No stream link configured for day {day} "
            f"(competition {competition.code}), skipping video download"
        )
        return False

    # Check if offset is configured
    if offset == 0:
        logger.error(
            f"Offset for day {day} is not configured "
            f"(competition {competition.code}), skipping video download"
        )
        return False

    # Calculate video timestamps (seconds into the stream)
    video_start_time = match.start_match_time - offset - buffer
    clip_duration = 150 + (2 * buffer)  # 2:30 + buffers

    # Ensure times are positive
    if video_start_time < 0:
        video_start_time = 0

    def _format_timestamp(seconds):
        """Convert seconds to HH:MM:SS format"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"

    logger.info(
        f"Downloading match {match.match_number} ({match.match_type}) from day {day} "
        f"[{_format_timestamp(video_start_time)} + {clip_duration}s] "
        f"(buffer: {buffer}s)"
    )

    # Determine output path
    output_filename = f"match_{match.match_type}_{match.match_number}_day{day}"
    final_file = output_path / f"{output_filename}.mp4"

    last_logged_percent = [-1]

    def progress_hook(d):
        if d["status"] == "downloading":
            downloaded = d.get("downloaded_bytes", 0)
            total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)
            if total:
                pct = int(downloaded / total * 100)
                if pct >= last_logged_percent[0] + 10:
                    last_logged_percent[0] = pct
                    logger.info(
                        f"  Downloading {output_filename}: {d.get('_percent_str', '').strip()} "
                        f"at {d.get('_speed_str', '').strip()}, ETA {d.get('_eta_str', '').strip()}"
                    )
        elif d["status"] == "finished":
            logger.info(f"  Download finished: {d.get('filename', output_filename)}")
        elif d["status"] == "error":
            logger.error(f"  Download error for {output_filename}")

    ydl_opts = {
        "format": "best",
        "extractor_args": {"youtube": {"player_client": ["android"]}},
        "download_ranges": yt_dlp.utils.download_range_func(
            None, [(video_start_time, video_start_time + clip_duration)]
        ),
        "force_keyframes_at_cuts": True,
        "outtmpl": str(final_file),
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [progress_hook],
    }

    try:
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl_check:
            info = ydl_check.extract_info(stream_link, download=False)
            if info.get("is_live"):
                logger.info(
                    f"Stream is still live for match {match.match_number}, "
                    f"will retry after stream ends"
                )
                return False

        logger.info(f"Starting yt-dlp download for {output_filename}...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([stream_link])

        if not final_file.exists():
            logger.error(f"Expected output file not found after download: {final_file}")
            return False

        logger.info(
            f"Successfully downloaded video for match {match.match_number} -> {output_filename}.mp4"
        )

        match.video_available = True
        match.save(update_fields=["video_available"])
        logger.info(f"Set video_available=True for match {match.match_number}")

        return True
    except Exception as e:
        logger.error(
            f"Failed to download video for match {match.match_number}: {str(e)}",
            exc_info=True,
        )
        return False


# Timer crop constants (at 640x360): crop=W:H:X:Y
_TIMER_CROP_W = 36
_TIMER_CROP_H = 20
_TIMER_CROP_X = 301
_TIMER_CROP_Y = 24
_SCAN_FPS = 5
_MATCH_START_OFFSET = 1  # seconds before 0:19 to start clip
_MATCH_DURATION = 170  # 150s match + 3s transition + 10s end buffer + 1s start offset + 5s FMS counter lag
_MATCH_START_THRESHOLD = 700  # MSE threshold for template match


def _load_reference_019():
    """Load the 0:19 reference image as raw RGB bytes."""
    from PIL import Image
    ref_path = Path(__file__).resolve().parent / "timer_019_reference.png"
    img = Image.open(ref_path).convert("RGB")
    return img.tobytes(), img.size


def _mse(bytes_a, bytes_b):
    """Mean squared error between two equal-length byte sequences."""
    total = 0
    for a, b in zip(bytes_a, bytes_b):
        diff = int(a) - int(b)
        total += diff * diff
    return total / len(bytes_a)


_SCAN_MAX_SECONDS = 120  # only scan first 120s of video


def find_match_start_timestamp(video_path: Path) -> float | None:
    """
    Scan video for the first frame where the scoreboard timer shows 0:19.

    Returns the timestamp in seconds, or None if not found.
    """
    ref_bytes, ref_size = _load_reference_019()
    w, h = ref_size

    max_frames = _SCAN_MAX_SECONDS * _SCAN_FPS

    # Pipe timer-region frames from ffmpeg as raw RGB
    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-vf", f"fps={_SCAN_FPS},crop={_TIMER_CROP_W}:{_TIMER_CROP_H}:{_TIMER_CROP_X}:{_TIMER_CROP_Y}",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
        "-loglevel", "error",
    ]

    frame_size = w * h * 3
    frame_num = 0
    found_timestamp = None

    logger.info(f"Scanning {video_path.name} for match start (0:19 timer, max {_SCAN_MAX_SECONDS}s)...")

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        while frame_num < max_frames:
            raw = proc.stdout.read(frame_size)
            if len(raw) < frame_size:
                break
            error = _mse(raw, ref_bytes)
            if error < _MATCH_START_THRESHOLD:
                found_timestamp = frame_num / _SCAN_FPS
                logger.info(
                    f"Found 0:19 at frame {frame_num} = {found_timestamp:.2f}s "
                    f"(MSE={error:.1f}) in {video_path.name}"
                )
                break
            frame_num += 1
    except Exception as e:
        logger.error(f"Error scanning {video_path.name} for match start: {e}")
        return None
    finally:
        try:
            proc.terminate()
        except Exception:
            pass
        try:
            proc.communicate(timeout=5)  # drain both stdout+stderr, prevent deadlock
        except Exception:
            proc.kill()

    if found_timestamp is None:
        logger.warning(f"0:19 timer frame not found in {video_path.name}")
    return found_timestamp


def _get_video_path(match, competition, output_dir="match_videos") -> Path:
    """Return the expected video file path for a match."""
    from backend.models import Match as MatchModel
    output_path = Path(__file__).resolve().parent.parent.parent / output_dir / competition.code
    first_match = (
        MatchModel.objects.filter(competition=competition, start_match_time__gt=0)
        .order_by("start_match_time")
        .first()
    )
    if not first_match:
        return output_path / f"match_{match.match_type}_{match.match_number}_day1.mp4"
    first_match_time = first_match.start_match_time
    day_1_end = first_match_time + (12 * 3600)
    day_2_end = day_1_end + (24 * 3600)
    match_time = match.start_match_time
    if match_time < day_1_end:
        day = 1
    elif match_time < day_2_end:
        day = 2
    else:
        day = 3
    return output_path / f"match_{match.match_type}_{match.match_number}_day{day}.mp4"


def clip_match_video(match, output_dir="match_videos") -> bool:
    """
    Clip a downloaded match video to start at the first 0:19 timer frame.

    Finds the match start by scanning the downloaded video for the scoreboard
    timer showing 0:19, then clips from that point for _MATCH_DURATION seconds.
    Overwrites the original file in place.

    Returns True on success, False on failure.
    """
    competition = match.competition
    video_path = _get_video_path(match, competition, output_dir)
    filename = video_path.name

    if not video_path.exists():
        logger.error(f"Video file not found: {video_path}")
        return False

    start_ts = find_match_start_timestamp(video_path)
    if start_ts is None:
        logger.error(f"Could not find match start in {filename}")
        return False

    # Clip in place: write to temp file then replace
    clip_start = max(0, start_ts - _MATCH_START_OFFSET)
    tmp_path = video_path.with_suffix(".tmp.mp4")
    cmd = [
        "ffmpeg",
        "-ss", str(clip_start),
        "-i", str(video_path),
        "-t", str(_MATCH_DURATION),
        "-c", "copy",
        str(tmp_path),
        "-y", "-loglevel", "error",
    ]

    logger.info(
        f"Clipping {filename} from {start_ts:.2f}s for {_MATCH_DURATION}s..."
    )
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"ffmpeg clip failed for {filename}: {result.stderr}")
            tmp_path.unlink(missing_ok=True)
            return False

        tmp_path.replace(video_path)
        match.video_clipped = True
        match.save(update_fields=["video_clipped"])
        logger.info(f"Clipped {filename} successfully, video_clipped=True")
        return True
    except Exception as e:
        logger.error(f"Error clipping {filename}: {e}", exc_info=True)
        tmp_path.unlink(missing_ok=True)
        return False
