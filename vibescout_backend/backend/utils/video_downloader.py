"""Utility functions for downloading match videos"""

import logging
import platform
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
