from django.core.management.base import BaseCommand
from django.db import transaction
import subprocess
import os
from pathlib import Path
from backend.models import Competition, Match


class Command(BaseCommand):
    help = 'Download match video clips from YouTube streams using yt-dlp'

    def add_arguments(self, parser):
        parser.add_argument(
            'competition_code',
            type=str,
            help='Competition code to download videos for (e.g., 2025gacmp)'
        )
        parser.add_argument(
            '--output-dir',
            type=str,
            default='match_videos',
            help='Output directory for downloaded videos (default: match_videos)'
        )
        parser.add_argument(
            '--match-number',
            type=int,
            default=None,
            help='Specific match number to download (optional, downloads all if not specified)'
        )
        parser.add_argument(
            '--buffer',
            type=int,
            default=30,
            help='Buffer time in seconds before/after match (default: 30)'
        )

    def handle(self, *args, **options):
        competition_code = options['competition_code']
        output_dir = options['output_dir']
        match_number = options['match_number']
        buffer = options['buffer']
        
        try:
            competition = Competition.objects.get(code=competition_code)
        except Competition.DoesNotExist:
            self.stdout.write(self.style.ERROR(
                f'Competition {competition_code} not found'
            ))
            return
        
        # Check if stream links are configured
        if not any([competition.stream_link_day_1, competition.stream_link_day_2, competition.stream_link_day_3]):
            self.stdout.write(self.style.ERROR(
                f'No stream links configured for competition {competition_code}'
            ))
            return
        
        # Create output directory
        output_path = Path(output_dir) / competition_code
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Get matches to download
        matches_query = Match.objects.filter(
            competition=competition,
            start_match_time__gt=0  # Only matches with actual start time
        ).select_related('competition')
        
        if match_number is not None:
            matches_query = matches_query.filter(match_number=match_number)
        
        matches = list(matches_query.order_by('start_match_time'))
        
        if not matches:
            self.stdout.write(self.style.WARNING(
                f'No matches found with start times for competition {competition_code}'
            ))
            return
        
        self.stdout.write(f'Found {len(matches)} matches to download')
        
        # Determine the first match time to calculate day boundaries
        first_match_time = matches[0].start_match_time
        day_1_end = first_match_time + (12 * 3600)  # 12 hours after first match
        day_2_end = day_1_end + (24 * 3600)  # 24 hours after day 1 end
        
        for match in matches:
            self.download_match_video(
                match, 
                competition, 
                output_path, 
                buffer,
                day_1_end,
                day_2_end
            )

    def download_match_video(self, match, competition, output_path, buffer, day_1_end, day_2_end):
        """Download a single match video clip"""
        
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
        
        if not stream_link:
            self.stdout.write(self.style.WARNING(
                f'  Skipping match {match.match_number}: No stream link for day {day}'
            ))
            return
        
        # Check if offset is configured
        if offset == 0:
            self.stdout.write(self.style.ERROR(
                f'  Skipping match {match.match_number}: offset_stream_time_to_unix_timestamp_day_{day} is not set!\n'
                f'    Please configure the offset in the Competition model before downloading videos.'
            ))
            return
        
        # Calculate video timestamps
        # offset is the number to ADD to stream time to get unix timestamp
        # So to get stream time from unix timestamp, we subtract the offset
        video_start_time = match.start_match_time - offset - buffer
        
        # Use actual match duration from end_match_time - start_match_time
        if match.end_match_time > 0 and match.end_match_time > match.start_match_time:
            video_end_time = match.end_match_time - offset + buffer
        else:
            # Fallback: estimate 3 minutes if end time not available
            self.stdout.write(self.style.WARNING(
                f'  Match {match.match_number}: No end_match_time, estimating 3 minutes'
            ))
            video_end_time = video_start_time + 180 + (2 * buffer)  # 3 minutes + buffers
        
        # Ensure times are positive
        if video_start_time < 0:
            video_start_time = 0
        
        # Format timestamps for yt-dlp (HH:MM:SS)
        start_formatted = self.format_timestamp(video_start_time)
        end_formatted = self.format_timestamp(video_end_time)
        
        # Create output filename
        output_file = output_path / f"match_{match.match_type}_{match.match_number}_day{day}.mp4"
        
        self.stdout.write(
            f'  Downloading match {match.match_number} ({match.match_type}) from day {day} '
            f'[{start_formatted} - {end_formatted}]'
        )
        
        # Build yt-dlp command
        cmd = [
            'yt-dlp',
            '--download-sections',
            f'*{start_formatted}-{end_formatted}',
            '-o', str(output_file),
            stream_link
        ]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )
            self.stdout.write(self.style.SUCCESS(
                f'    ✓ Downloaded: {output_file.name}'
            ))
        except subprocess.CalledProcessError as e:
            self.stdout.write(self.style.ERROR(
                f'    ✗ Failed to download match {match.match_number}: {e.stderr}'
            ))
        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(
                '    ✗ yt-dlp not found. Please install it: pip install yt-dlp'
            ))
            return

    def format_timestamp(self, seconds):
        """Convert seconds to HH:MM:SS format"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f'{hours:02d}:{minutes:02d}:{secs:02d}'
