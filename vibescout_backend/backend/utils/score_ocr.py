"""
OCR utility for reading cumulative fuel scores from match videos.

Extracts per-second red/blue fuel score timelines by cropping the scoreboard
region, preprocessing, and running Tesseract OCR on each frame.
"""

import logging
import os
import re
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytesseract
from PIL import Image

os.environ["OMP_THREAD_LIMIT"] = "1"

logger = logging.getLogger(__name__)

# Crop coordinates (W:H:X:Y) at 640x360 resolution
_RED_CROP = "48:12:30:22"
_BLUE_CROP = "58:12:578:22"
_SCALE_FACTOR = 16
_OCR_FPS = 1
_MAX_DELTA_PER_SECOND = 100


def _extract_frames(video_path: Path, crop: str, out_dir: Path) -> None:
    """Extract preprocessed frames from a video region using ffmpeg."""
    w, h, x, y = (int(v) for v in crop.split(":"))
    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-vf", (
            f"crop={w}:{h}:{x}:{y},"
            f"scale={w * _SCALE_FACTOR}:{h * _SCALE_FACTOR},"
            f"fps={_OCR_FPS},"
            "format=gray,negate,eq=contrast=3"
        ),
        "-f", "image2",
        "-pix_fmt", "gray",
        str(out_dir / "%03d.png"),
        "-y", "-loglevel", "error",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"ffmpeg frame extraction failed: {result.stderr}")


def _parse_score(text: str) -> int:
    """
    Parse OCR text into an integer score.

    Handles formats like "80/100", "80 / 100", "807100" (slash misread as 7),
    "80 100" (slash dropped), and S/$ misread as 5.

    Returns -1 if the text cannot be parsed.
    """
    text = text.replace("S", "5").replace("$", "5")
    clean = re.sub(r"[^0-9/]", " ", text).strip()

    # Format: NUM / DENOM
    if "/" in clean:
        parts = clean.split("/")
        numerator = re.sub(r"\D", "", parts[0])
        denominator = re.sub(r"\D", "", parts[1]) if len(parts) > 1 else ""
        if not numerator:
            if denominator:
                return 0
            return -1
        if denominator:
            n = int(numerator)
            d = int(denominator)
            if n <= d:
                return n

    # Format: NUM 100 or NUM 360 (slash dropped entirely)
    space_m = re.match(r"(\d+)\s+(100|360)", clean)
    if space_m:
        n = int(space_m.group(1))
        d = int(space_m.group(2))
        if n <= d:
            return n

    # Format: X7YYY (slash misread as 7, e.g. 807100 = 80/100)
    digits = re.sub(r"\D", "", clean)
    if not digits:
        return -1
    m = re.match(r"(\d+)7(\d{3})", digits)
    if m:
        n, denom = int(m.group(1)), int(m.group(2))
        if n > denom:
            return -1
        return n

    return -1


def _build_timeline(raw: dict[int, int], total_seconds: int) -> list[int]:
    """
    Build a clean cumulative timeline from raw per-second OCR scores.

    Rejects values that decrease or jump by more than _MAX_DELTA_PER_SECOND.
    Uses spike detection: if 3+ consecutive frames show a decrease from the
    last valid value, the last valid value is treated as the spike and replaced.

    Returns a list where index = second, value = cumulative score or -1.
    """
    _SPIKE_LOOKBACK = 3
    result = []
    last_valid = None
    last_valid_idx = None
    decrease_buf = []

    for sec in range(total_seconds):
        val = raw.get(sec, -1)
        if val == -1:
            result.append(-1)
            continue

        if last_valid is None:
            result.append(val)
            last_valid = val
            last_valid_idx = sec
            decrease_buf = []
        else:
            delta = val - last_valid
            if delta < 0:
                result.append(-1)
                decrease_buf.append((sec, val))
                if len(decrease_buf) >= _SPIKE_LOOKBACK:
                    result[last_valid_idx] = -1
                    last_valid = None
                    last_valid_idx = None
                    for buf_sec, buf_val in decrease_buf:
                        if last_valid is None:
                            result[buf_sec] = buf_val
                            last_valid = buf_val
                            last_valid_idx = buf_sec
                        else:
                            d = buf_val - last_valid
                            if 0 <= d <= _MAX_DELTA_PER_SECOND:
                                result[buf_sec] = buf_val
                                last_valid = buf_val
                                last_valid_idx = buf_sec
                    decrease_buf = []
            elif delta > _MAX_DELTA_PER_SECOND:
                result.append(-1)
                decrease_buf = []
            else:
                result.append(val)
                last_valid = val
                last_valid_idx = sec
                decrease_buf = []

    return result


def _ocr_frame(frame_path: Path) -> tuple[int, int]:
    """OCR a single frame, returning (second, score)."""
    sec = int(frame_path.stem) - 1  # ffmpeg names start at 001
    try:
        img = Image.open(frame_path)
        raw = pytesseract.image_to_string(
            img, lang="eng", config="--oem 3 --psm 7"
        ).strip()
        score = _parse_score(raw)
        return sec, score
    except Exception as e:
        logger.warning(f"OCR error on {frame_path}: {e}")
        return sec, -1


def ocr_fuel_timeline(video_path: Path) -> dict:
    """
    OCR the red and blue fuel score timelines from a clipped match video.

    Args:
        video_path: Path to the clipped match video.

    Returns:
        {"red": [0, 0, 2, 5, ...], "blue": [0, 1, 3, ...]}
        where each list index is the match second and value is cumulative score
        (-1 for frames that could not be read).
    """
    video_path = Path(video_path)
    tmp = Path(tempfile.mkdtemp(prefix="ocr_"))

    try:
        red_dir = tmp / "red"
        blue_dir = tmp / "blue"
        red_dir.mkdir()
        blue_dir.mkdir()

        # Extract frames
        _extract_frames(video_path, _RED_CROP, red_dir)
        _extract_frames(video_path, _BLUE_CROP, blue_dir)

        result = {}
        for alliance, frame_dir in [("red", red_dir), ("blue", blue_dir)]:
            frames = sorted(frame_dir.glob("*.png"))
            total_seconds = len(frames)

            # OCR in parallel
            with ThreadPoolExecutor(max_workers=4) as ex:
                raw_scores = dict(ex.map(_ocr_frame, frames))

            result[alliance] = _build_timeline(raw_scores, total_seconds)

        return result
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
