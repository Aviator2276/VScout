"""
Background tasks for VibeScout.

These tasks run periodically to sync data from The Blue Alliance API
and perform other maintenance operations.
"""

import logging
import os
from typing import Optional

from django.db.models import Max

logger = logging.getLogger(__name__)


def check_and_sync_new_matches(competition_code: Optional[str] = None) -> dict:
    """
    Check for new matches in TBA and sync them to the database.

    This task:
    1. Finds the lowest match number with has_played=False (unplayed match)
    2. Checks TBA to update that match with current data
    3. If all matches are played, checks for new matches sequentially

    Args:
        competition_code: Competition code (e.g., "2025gacmp").
                         If None, uses COMPCODE from environment.

    Returns:
        dict with status information about the sync
    """
    from .models import Competition, Match
    from .utils.match_utils import add_match_from_tba

    # Get competition code from env if not provided
    if not competition_code:
        competition_code = os.getenv("COMPCODE")
        if not competition_code:
            logger.error(
                "No competition code provided and COMPCODE env variable not set"
            )
            return {"success": False, "error": "No competition code available"}

    logger.info(f"Checking for new matches for competition: {competition_code}")

    # Get TBA API key
    tba_api_key = os.getenv("TBA_API_KEY")
    if not tba_api_key:
        logger.error("TBA_API_KEY not set in environment variables")
        return {"success": False, "error": "TBA_API_KEY not configured"}

    try:
        # Get the competition from database
        competition = Competition.objects.get(code=competition_code)
    except Competition.DoesNotExist:
        logger.error(f"Competition {competition_code} not found in database")
        return {"success": False, "error": f"Competition {competition_code} not found"}

    # Initialize TBA client
    from .utils.tba_api import TBAClient

    tba = TBAClient(tba_api_key)

    # Get the lowest match number with has_played=False, or the next match after the highest
    unplayed_match = (
        Match.objects.filter(
            competition=competition, match_type="qualification", has_played=False
        )
        .order_by("match_number")
        .first()
    )

    if unplayed_match:
        # Start checking from the first unplayed match
        start_match_number = unplayed_match.match_number
        logger.info(f"Found unplayed match {start_match_number}, will check from there")
    else:
        # All matches have been played, check for next match after highest
        latest_match = Match.objects.filter(
            competition=competition, match_type="qualification"
        ).aggregate(Max("match_number"))

        latest_match_number = latest_match["match_number__max"] or 0
        start_match_number = latest_match_number + 1
        logger.info(
            f"All matches played, latest is {latest_match_number}, checking for match {start_match_number}"
        )

    # Update only ONE match - the first unplayed match or next sequential match
    match_key = f"{competition_code}_qm{start_match_number}"

    try:
        # Use the existing add_match_from_tba utility
        # This will create OR update the match with latest data from TBA
        match = add_match_from_tba(
            tba_client=tba,
            competition_code=competition_code,
            match_number=start_match_number,
            match_type_code="qm",
            set_number=1,
            stdout=None,  # Don't print to stdout in background task
        )

        logger.info(
            f"Successfully updated match {start_match_number} (has_played: {match.has_played})"
        )

        return {
            "success": True,
            "message": f"Updated match {start_match_number}",
            "match_number": start_match_number,
            "match_key": match_key,
            "has_played": match.has_played,
            "blue_teams": [
                match.blue_team_1.number,
                match.blue_team_2.number,
                match.blue_team_3.number,
            ],
            "red_teams": [
                match.red_team_1.number,
                match.red_team_2.number,
                match.red_team_3.number,
            ],
        }

    except Exception as e:
        # Match doesn't exist or error occurred
        error_msg = str(e).lower()
        if "404" in error_msg or "not found" in error_msg:
            logger.info(f"Match {match_key} not found in TBA")
            return {
                "success": True,
                "message": f"Match {start_match_number} not found in TBA",
                "checked_match": start_match_number,
                "match_found": False,
            }
        else:
            logger.error(f"Error updating match {match_key}: {str(e)}")
            return {
                "success": False,
                "error": f"Error updating match {start_match_number}: {str(e)}",
                "match_number": start_match_number,
            }


def sync_all_competition_matches(competition_code: Optional[str] = None) -> dict:
    """
    Full sync of all matches for a competition from TBA.

    This is a more comprehensive sync that pulls all matches,
    useful for initial setup or recovery.

    Args:
        competition_code: Competition code (e.g., "2025gacmp").
                         If None, uses COMPCODE from environment.

    Returns:
        dict with status information about the sync
    """
    from .models import Competition
    from .utils.match_utils import import_match_from_dict

    # Get competition code from env if not provided
    if not competition_code:
        competition_code = os.getenv("COMPCODE")
        if not competition_code:
            logger.error(
                "No competition code provided and COMPCODE env variable not set"
            )
            return {"success": False, "error": "No competition code available"}

    logger.info(f"Starting full match sync for competition: {competition_code}")

    # Get TBA API key
    tba_api_key = os.getenv("TBA_API_KEY")
    if not tba_api_key:
        logger.error("TBA_API_KEY not set in environment variables")
        return {"success": False, "error": "TBA_API_KEY not configured"}

    try:
        # Get the competition from database
        competition = Competition.objects.get(code=competition_code)
    except Competition.DoesNotExist:
        logger.error(f"Competition {competition_code} not found in database")
        return {"success": False, "error": f"Competition {competition_code} not found"}

    # Initialize TBA client
    from .utils.tba_api import TBAClient

    tba = TBAClient(tba_api_key)

    try:
        # Fetch all matches for the event
        matches = tba.event_matches(competition_code)
        logger.info(f"Retrieved {len(matches)} matches from TBA")

        # Import each match
        matches_imported = 0
        for match_data in matches:
            try:
                import_match_from_dict(match_data, competition, stdout=None)
                matches_imported += 1
            except Exception as e:
                logger.error(f"Error importing match {match_data.get('key')}: {str(e)}")

        logger.info(f"Successfully imported {matches_imported} matches")

        return {
            "success": True,
            "message": f"Imported {matches_imported} of {len(matches)} matches",
            "total_matches": len(matches),
            "imported_matches": matches_imported,
        }

    except Exception as e:
        logger.error(f"Error syncing matches: {str(e)}")
        return {"success": False, "error": f"Error syncing matches: {str(e)}"}


def compute_fuel_timeline_task(match_id: int) -> dict:
    """
    Background task to compute per-second fuel scores for a match using LLM vision.

    Crops red/blue scoreboard regions from the clipped video into a temp directory,
    runs LLM inference on each frame, and saves the result to match.fuel_timeline.
    """
    import shutil
    import subprocess
    import tempfile
    from pathlib import Path

    from .models import Match
    from .utils.fuel_count_llm import scores_from_images
    from .utils.video_downloader import _get_video_path

    try:
        match = Match.objects.get(pk=match_id)
    except Match.DoesNotExist:
        logger.error(f"Match {match_id} not found")
        return {"success": False, "error": f"Match {match_id} not found"}

    video_path = _get_video_path(match, match.competition)
    if not video_path.exists():
        logger.error(f"Video not found for match {match_id}: {video_path}")
        return {"success": False, "error": "Video file not found"}

    tmp = Path(tempfile.mkdtemp(prefix="fuel_llm_"))
    try:
        red_dir = tmp / "red"
        blue_dir = tmp / "blue"
        red_dir.mkdir()
        blue_dir.mkdir()

        # Crop coords (W:H:X:Y) at 640x360 — calibrated from 2026gadal (Dalton) scoreboard
        # Blue score is on the LEFT side (bottom strip), red is mirrored on the RIGHT
        crops = [
            ("blue", "83:25:45:333",  str(blue_dir / "%03d.jpg")),
            ("red",  "83:25:512:333", str(red_dir / "%03d.jpg")),
        ]
        for alliance, crop, out_pattern in crops:
            w, h, x, y = crop.split(":")
            cmd = [
                "/usr/bin/ffmpeg", "-i", str(video_path),
                "-vf", f"crop={w}:{h}:{x}:{y},scale={int(w)*32}:{int(h)*32},fps=1",
                "-f", "image2", "-q:v", "2",
                out_pattern, "-y", "-loglevel", "error",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"ffmpeg crop failed for {alliance}: {result.stderr}")
                return {"success": False, "error": f"ffmpeg failed for {alliance}"}

        logger.info(f"Running LLM fuel timeline for match {match.match_number}")
        timeline = scores_from_images(str(tmp))

        match.fuel_timeline = timeline
        match.save(update_fields=["fuel_timeline"])
        logger.info(f"Saved fuel_timeline for match {match.match_number}")

        # Queue fuel attribution now that timeline is ready
        from django_q.tasks import async_task
        async_task(
            "backend.tasks.attribute_fuel_to_robots_task",
            match.pk,
            task_name=f"fuel_attribution_{match.competition.code}_match_{match.match_number}",
        )

        return {
            "success": True,
            "match_id": match_id,
            "match_number": match.match_number,
        }
    except Exception as e:
        logger.error(f"compute_fuel_timeline_task error for match {match_id}: {e}")
        return {"success": False, "error": str(e)}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def attribute_fuel_to_robots_task(match_id: int) -> dict:
    """
    Attribute fuel scored to individual robots using the LLM fuel timeline and
    scouted RobotAction records.

    For each second in the timeline, computes the score delta and assigns it
    equally among robots on that alliance that are shooting at that second.
    Only processes an alliance if all 3 robots have been scouted.

    Writes results to per-robot auto_fuel, teleop_fuel, and fuel_scored fields.
    """
    from .models import Match, RobotAction

    try:
        match = Match.objects.get(pk=match_id)
    except Match.DoesNotExist:
        logger.error(f"Match {match_id} not found")
        return {"success": False, "error": f"Match {match_id} not found"}

    if not match.fuel_timeline:
        logger.info(f"No fuel timeline for match {match_id}, skipping fuel attribution")
        return {"success": False, "error": "No fuel timeline available"}

    def parse_score(s):
        try:
            return int(s)
        except (ValueError, TypeError):
            return None

    alliance_configs = {
        "blue": {
            "teams": [match.blue_team_1, match.blue_team_2, match.blue_team_3],
            "positions": ["blue_1", "blue_2", "blue_3"],
            "timeline_key": "blue",
        },
        "red": {
            "teams": [match.red_team_1, match.red_team_2, match.red_team_3],
            "positions": ["red_1", "red_2", "red_3"],
            "timeline_key": "red",
        },
    }

    updates = {}

    for alliance, config in alliance_configs.items():
        teams = config["teams"]
        positions = config["positions"]
        timeline_key = config["timeline_key"]

        # Only process if all 3 robots have been scouted
        scouted = sum(
            1 for team in teams
            if RobotAction.objects.filter(match=match, team=team).exists()
        )
        if scouted < 3:
            logger.info(
                f"Alliance {alliance} only has {scouted}/3 robots scouted for match "
                f"{match.match_number}, skipping"
            )
            continue

        timeline = match.fuel_timeline.get(timeline_key, [])
        if not timeline:
            continue

        # Parse OCR strings to ints, forward-filling None gaps
        raw = [parse_score(s) for s in timeline]
        last_valid = 0
        parsed_scores = []
        for s in raw:
            if s is not None:
                last_valid = s
            parsed_scores.append(last_valid)

        # Pre-fetch actions for each robot
        actions_by_team = {}
        for team in teams:
            actions_by_team[team.pk] = list(
                RobotAction.objects.filter(match=match, team=team).values(
                    "action_type", "start_time", "end_time"
                )
            )

        auto_fuel = {pos: 0.0 for pos in positions}
        teleop_fuel = {pos: 0.0 for pos in positions}

        # Lookahead accounts for fuel flight time, FMS delay, and human scouting error
        SCORE_LOOKAHEAD = 8  # seconds
        # Orphaned deltas above this threshold are redistributed proportionally
        ORPHAN_REDISTRIBUTE_THRESHOLD = 3

        orphaned_auto = 0.0
        orphaned_teleop = 0.0

        prev_score = parsed_scores[0] if parsed_scores else 0
        # sec_idx is the match second (frame N = second N of the clipped match)
        for sec_idx, score in enumerate(parsed_scores[1:], start=1):
            delta = score - prev_score
            prev_score = score

            if delta <= 0:
                continue

            is_auto = sec_idx < 15

            # Find robots shooting in the window [sec_idx - SCORE_LOOKAHEAD, sec_idx]
            window_start = sec_idx - SCORE_LOOKAHEAD
            shooting = []
            for team, pos in zip(teams, positions):
                for action in actions_by_team[team.pk]:
                    if (
                        action["action_type"] == "shooting"
                        and float(action["start_time"]) <= sec_idx
                        and float(action["end_time"]) > window_start
                    ):
                        shooting.append(pos)
                        break

            if not shooting:
                # Accumulate large orphans for redistribution
                if delta > ORPHAN_REDISTRIBUTE_THRESHOLD:
                    if is_auto:
                        orphaned_auto += delta
                    else:
                        orphaned_teleop += delta
                continue

            share = delta / len(shooting)
            for pos in shooting:
                if is_auto:
                    auto_fuel[pos] += share
                else:
                    teleop_fuel[pos] += share

        # Redistribute large orphans proportionally based on each robot's attributed fuel
        total_attributed = sum(auto_fuel[p] + teleop_fuel[p] for p in positions)
        if total_attributed > 0 and (orphaned_auto + orphaned_teleop) > 0:
            for pos in positions:
                robot_share = (auto_fuel[pos] + teleop_fuel[pos]) / total_attributed
                auto_fuel[pos] += orphaned_auto * robot_share
                teleop_fuel[pos] += orphaned_teleop * robot_share

        for pos in positions:
            auto = round(auto_fuel[pos])
            teleop = round(teleop_fuel[pos])
            updates[f"{pos}_auto_fuel"] = auto
            updates[f"{pos}_teleop_fuel"] = teleop
            updates[f"{pos}_fuel_scored"] = auto + teleop

    if updates:
        for field, value in updates.items():
            setattr(match, field, value)
        match.save(update_fields=list(updates.keys()))
        logger.info(
            f"Attributed fuel for match {match.match_number} "
            f"({match.competition.code}): {updates}"
        )
        return {"success": True, "match_id": match_id, "updates": updates}

    return {"success": True, "match_id": match_id, "message": "No alliances ready yet"}


def clip_match_video_task(match_id: int) -> dict:
    """
    Background task to clip a downloaded match video to exact match start.

    Scans the video for the first frame where the scoreboard timer shows 0:19,
    then trims from that point for 153 seconds (150s match + 3s buffer).
    """
    from .models import Match
    from .utils.video_downloader import clip_match_video

    try:
        match = Match.objects.get(pk=match_id)
    except Match.DoesNotExist:
        logger.error(f"Match with id {match_id} not found")
        return {"success": False, "error": f"Match {match_id} not found"}

    logger.info(
        f"Starting video clip for match {match.match_number} "
        f"({match.competition.code})"
    )

    success = clip_match_video(match)

    if success:
        logger.info(
            f"Successfully clipped video for match {match.match_number} "
            f"({match.competition.code})"
        )
        from django_q.tasks import async_task
        async_task(
            "backend.tasks.compute_fuel_timeline_task",
            match.pk,
            task_name=f"fuel_timeline_{match.competition.code}_match_{match.match_number}",
        )
        logger.info(f"Queued fuel timeline task for match {match.match_number}")
        return {
            "success": True,
            "message": f"Clipped video for match {match.match_number}",
            "match_id": match_id,
            "match_number": match.match_number,
            "competition_code": match.competition.code,
        }
    else:
        logger.warning(
            f"Failed to clip video for match {match.match_number} "
            f"({match.competition.code})"
        )
        return {
            "success": False,
            "error": f"Video clip failed for match {match.match_number}",
            "match_id": match_id,
            "match_number": match.match_number,
            "competition_code": match.competition.code,
        }


def check_and_download_videos(competition_code: Optional[str] = None) -> dict:
    """
    Scheduled task: queue a download for the first played match without a video.
    Runs independently of match syncing. Only queues one download at a time.
    """
    from .models import Competition, Match

    if not competition_code:
        competition_code = os.getenv("COMPCODE")
        if not competition_code:
            return {"success": False, "error": "No competition code available"}

    try:
        competition = Competition.objects.get(code=competition_code)
    except Competition.DoesNotExist:
        return {"success": False, "error": f"Competition {competition_code} not found"}

    if not any([competition.stream_link_day_1, competition.stream_link_day_2, competition.stream_link_day_3]):
        return {"success": True, "message": "No stream links configured, skipping"}

    match = (
        Match.objects.filter(
            competition=competition,
            has_played=True,
            video_available=False,
            skip_processing=False,
            match_type="qualification",
        )
        .order_by("match_number")
        .first()
    )

    from django_q.models import OrmQ
    from django_q.tasks import async_task

    # Check for clipped-but-missing-fuel-timeline matches first
    no_timeline = (
        Match.objects.filter(
            competition=competition,
            has_played=True,
            video_clipped=True,
            skip_processing=False,
            fuel_timeline__isnull=True,
            match_type="qualification",
        )
        .order_by("match_number")
        .first()
    )
    if no_timeline:
        timeline_task_name = f"fuel_timeline_{competition_code}_match_{no_timeline.match_number}"
        already_queued = any(timeline_task_name in (q.name() or "") for q in OrmQ.objects.all())
        if not already_queued:
            logger.info(f"Queuing fuel timeline task for match {no_timeline.match_number} ({competition_code})")
            async_task(
                "backend.tasks.compute_fuel_timeline_task",
                no_timeline.pk,
                task_name=timeline_task_name,
            )
            return {"success": True, "message": f"Queued fuel timeline for match {no_timeline.match_number}"}

    # Check for downloaded-but-not-clipped matches
    unclipped = (
        Match.objects.filter(
            competition=competition,
            has_played=True,
            video_available=True,
            video_clipped=False,
            skip_processing=False,
            match_type="qualification",
        )
        .order_by("match_number")
        .first()
    )
    if unclipped:
        from pathlib import Path
        from .utils.video_downloader import _get_video_path
        video_path = _get_video_path(unclipped, competition)
        if not video_path.exists():
            logger.warning(
                f"Match {unclipped.match_number} marked video_available but file missing, resetting"
            )
            unclipped.video_available = False
            unclipped.save(update_fields=["video_available"])
        else:
            clip_task_name = f"clip_video_{competition_code}_match_{unclipped.match_number}"
            already_queued = any(clip_task_name in (q.name() or "") for q in OrmQ.objects.all())
            if not already_queued:
                logger.info(f"Queuing clip task for match {unclipped.match_number} ({competition_code})")
                async_task(
                    "backend.tasks.clip_match_video_task",
                    unclipped.pk,
                    task_name=clip_task_name,
                )
                return {"success": True, "message": f"Queued clip for match {unclipped.match_number}"}

    if not match:
        return {"success": True, "message": "No pending video downloads"}

    # Check if a download task is already queued for this competition
    task_prefix = f"download_video_{competition_code}"
    already_queued = any(task_prefix in (q.name() or "") for q in OrmQ.objects.all())

    if already_queued:
        logger.info(f"Download task already queued for {competition_code}, skipping")
        return {"success": True, "message": "Download already queued"}

    task_name = f"download_video_{competition_code}_match_{match.match_number}"
    logger.info(f"Queuing video download for match {match.match_number} ({competition_code})")
    async_task(
        "backend.tasks.download_match_video_task",
        match.pk,
        task_name=task_name,
    )
    return {"success": True, "message": f"Queued download for match {match.match_number}"}



def compute_stream_offsets(competition_code: Optional[str] = None) -> dict:
    """
    Compute stream offsets for a competition once match 1 has a start_match_time.

    Waits until the first played qualification match has a start_match_time, then
    computes offset = start_match_time - first_match_video_position and saves it.
    Once done, unschedules itself and schedules the normal match sync + video tasks.
    """
    from .models import Competition, Match

    if not competition_code:
        competition_code = os.getenv("COMPCODE")
        if not competition_code:
            return {"success": False, "error": "No competition code available"}

    try:
        competition = Competition.objects.get(code=competition_code)
    except Competition.DoesNotExist:
        return {"success": False, "error": f"Competition {competition_code} not found"}

    # Find the first played qualification match with a start_match_time
    first_match = (
        Match.objects.filter(
            competition=competition,
            match_type="qualification",
            has_played=True,
            start_match_time__gt=0,
        )
        .order_by("match_number")
        .first()
    )

    if not first_match:
        logger.info(
            f"No played matches with start_match_time yet for {competition_code}, will retry"
        )
        return {"success": True, "message": "Waiting for first match start_match_time"}

    # Determine which day the first match is on and compute offset
    updated = False
    if competition.first_match_video_position_day_1 > 0 and competition.offset_stream_time_to_unix_timestamp_day_1 == 0:
        offset = first_match.start_match_time - competition.first_match_video_position_day_1
        competition.offset_stream_time_to_unix_timestamp_day_1 = offset
        competition.save(update_fields=["offset_stream_time_to_unix_timestamp_day_1"])
        logger.info(f"Computed day 1 offset for {competition_code}: {offset}")
        updated = True

    if not updated:
        logger.info(f"No offset to compute for {competition_code} (position not set or offset already set)")
        return {"success": True, "message": "Nothing to compute"}

    # Unschedule this task and schedule the normal tasks
    from datetime import timedelta

    from django.utils import timezone
    from django_q.models import Schedule

    Schedule.objects.filter(name=f"compute_stream_offsets_{competition_code}").delete()
    logger.info(f"Unscheduled compute_stream_offsets for {competition_code}")

    check_matches_interval = 1  # minutes

    Schedule.objects.get_or_create(
        name=f"check_new_matches_{competition_code}",
        defaults=dict(
            func="backend.tasks.check_and_sync_new_matches",
            args=f'"{competition_code}"',
            schedule_type=Schedule.MINUTES,
            minutes=check_matches_interval,
            repeats=-1,
        ),
    )
    Schedule.objects.get_or_create(
        name=f"check_video_downloads_{competition_code}",
        defaults=dict(
            func="backend.tasks.check_and_download_videos",
            args=f'"{competition_code}"',
            schedule_type=Schedule.MINUTES,
            minutes=check_matches_interval,
            next_run=timezone.now() + timedelta(minutes=check_matches_interval / 2),
            repeats=-1,
        ),
    )
    logger.info(f"Scheduled normal match sync and video download tasks for {competition_code}")

    return {"success": True, "message": "Offset computed and normal tasks scheduled"}


def download_match_video_task(match_id: int, buffer: int = 30) -> dict:
    """
    Background task to download a match video from YouTube stream.

    This task is queued automatically when a match's has_played status changes to True.

    Args:
        match_id: Primary key of the Match to download video for
        buffer: Buffer time in seconds before/after match (default: 30)

    Returns:
        dict with download status
    """
    from .models import Match
    from .utils.video_downloader import download_match_video

    try:
        match = Match.objects.get(pk=match_id)
    except Match.DoesNotExist:
        logger.error(f"Match with id {match_id} not found")
        return {"success": False, "error": f"Match {match_id} not found"}

    logger.info(
        f"Starting video download for match {match.match_number} "
        f"({match.competition.code})"
    )

    # Download the video
    success = download_match_video(match, buffer=buffer)

    if success:
        logger.info(
            f"Successfully downloaded video for match {match.match_number} "
            f"({match.competition.code}), video_available set to True"
        )

        # Queue clip task
        from django_q.tasks import async_task
        clip_task_name = f"clip_video_{match.competition.code}_match_{match.match_number}"
        async_task(
            "backend.tasks.clip_match_video_task",
            match.pk,
            task_name=clip_task_name,
        )
        logger.info(f"Queued clip task for match {match.match_number}")

        return {
            "success": True,
            "message": f"Downloaded video for match {match.match_number}",
            "match_id": match_id,
            "match_number": match.match_number,
            "competition_code": match.competition.code,
            "video_available": True,
        }
    else:
        logger.warning(
            f"Failed to download video for match {match.match_number} "
            f"({match.competition.code})"
        )
        return {
            "success": False,
            "error": f"Video download failed for match {match.match_number}",
            "match_id": match_id,
            "match_number": match.match_number,
            "competition_code": match.competition.code,
            "video_available": False,
        }


