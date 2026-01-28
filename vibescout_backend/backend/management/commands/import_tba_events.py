from django.core.management.base import BaseCommand
from django.db import transaction
import tbapy
import os
from pathlib import Path
from dotenv import load_dotenv
from backend.models import Team, Competition, Match, TeamInfo


class Command(BaseCommand):
    help = 'Import event data from The Blue Alliance API'

    def add_arguments(self, parser):
        parser.add_argument(
            'event_keys',
            nargs='+',
            type=str,
            help='Event keys to import (e.g., 2020gagai 2020gadal)'
        )
        parser.add_argument(
            '--api-key',
            type=str,
            default='',
            help='TBA API key (or set TBA_API_KEY environment variable)'
        )

    def handle(self, *args, **options):
        env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / '.env'
        if env_path.exists():
            load_dotenv(env_path)
        
        api_key = options['api_key']
        if not api_key:
            api_key = os.environ.get('TBA_API_KEY', '')
        
        if not api_key:
            self.stdout.write(self.style.ERROR(
                'API key required. Provide via --api-key or TBA_API_KEY environment variable'
            ))
            return

        tba = tbapy.TBA(api_key)
        
        for event_key in options['event_keys']:
            self.stdout.write(f'Processing event: {event_key}')
            try:
                self.import_event(tba, event_key)
                self.stdout.write(self.style.SUCCESS(
                    f'Successfully imported {event_key}'
                ))
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f'Error importing {event_key}: {str(e)}'
                ))

    @transaction.atomic
    def import_event(self, tba, event_key):
        event_info = tba.event(event_key)
        
        defaults = {'name': event_info['name']}
        
        # Add stream links for specific competitions
        if event_key == '2025gacmp':
            # Stream timestamps where first match of each day starts:
            # Day 1: 3:56:03, Day 2: 35:25, Day 3: 27:31
            stream_time_day_1 = (3 * 3600) + (56 * 60) + 3  # 14125 seconds
            stream_time_day_2 = (35 * 60) + 25   # 2087 seconds
            stream_time_day_3 = (27 * 60) + 31  # 1613 seconds
            
            defaults.update({
                'stream_link_day_1': 'https://www.youtube.com/watch?v=p-CZ4LRTTqQ',
                'stream_link_day_2': 'https://www.youtube.com/watch?v=TJuzMzMi-g4&pp=2AaxDA%3D%3D',
                'stream_link_day_3': 'https://www.youtube.com/watch?v=0oHvm-ZECB0',
            })
        
        competition, created = Competition.objects.get_or_create(
            code=event_key,
            defaults=defaults
        )
        
        # Update stream links if competition already exists
        if not created and event_key == '2025gacmp':
            competition.stream_link_day_1 = 'https://www.youtube.com/watch?v=p-CZ4LRTTqQ'
            competition.stream_link_day_2 = 'https://www.youtube.com/watch?v=TJuzMzMi-g4&pp=2AaxDA%3D%3D'
            competition.stream_link_day_3 = 'https://www.youtube.com/watch?v=0oHvm-ZECB0'
            competition.save()
        
        if created:
            self.stdout.write(f'  Created competition: {competition.name}')
        else:
            self.stdout.write(f'  Using existing competition: {competition.name}')
        
        matches = tba.event_matches(event_key)
        self.stdout.write(f'  Found {len(matches)} matches')
        
        teams_in_event = set()
        for match_data in matches:
            match_teams = self.import_match(match_data, competition)
            teams_in_event.update(match_teams)
        
        self.stdout.write(f'  Imported {len(matches)} matches for {event_key}')
        
        self.create_team_infos(teams_in_event, competition)
        self.stdout.write(f'  Created/verified TeamInfo records for {len(teams_in_event)} teams')
        
        # Calculate and set offsets for 2025gacmp
        if event_key == '2025gacmp':
            self.calculate_and_set_offsets(competition, stream_time_day_1, stream_time_day_2, stream_time_day_3)

    def import_match(self, match_data, competition):
        alliances = match_data.get('alliances', {})
        blue_alliance = alliances.get('blue', {})
        red_alliance = alliances.get('red', {})
        
        blue_team_keys = blue_alliance.get('team_keys', [])
        red_team_keys = red_alliance.get('team_keys', [])
        
        if len(blue_team_keys) < 3 or len(red_team_keys) < 3:
            self.stdout.write(self.style.WARNING(
                f'  Skipping match {match_data.get("key")} - incomplete teams'
            ))
            return
        
        match_number = match_data.get('match_number', 0)
        tba_key = match_data.get('key', '')
        
        # Determine match type from TBA comp_level
        comp_level = match_data.get('comp_level', 'qm')
        match_type_map = {
            'qm': 'qualification',
            'qf': 'quarterfinal',
            'sf': 'semifinal',
            'f': 'final',
        }
        match_type = match_type_map.get(comp_level, 'qualification')
        
        # Extract set_number from TBA key (e.g., qf1m1 -> set 1, qf2m1 -> set 2)
        # For qualification matches, set_number is always 1
        set_number = 1
        if comp_level in ['qf', 'sf', 'f']:
            import re
            # Match pattern like 'qf1', 'sf2', 'f1' in the key
            match_pattern = re.search(r'_(' + comp_level + r')(\d+)m', tba_key)
            if match_pattern:
                set_number = int(match_pattern.group(2))
        
        blue_teams = [self.get_or_create_team(key) for key in blue_team_keys[:3]]
        red_teams = [self.get_or_create_team(key) for key in red_team_keys[:3]]
        
        score_breakdown = match_data.get('score_breakdown', {})
        blue_breakdown = score_breakdown.get('blue', {})
        red_breakdown = score_breakdown.get('red', {})
        
        blue_score = blue_alliance.get('score', 0) or 0
        red_score = red_alliance.get('score', 0) or 0
        
        # Extract year from event key to determine game-specific scoring
        year = int(tba_key[:4])
        
        # Initialize scoring variables
        total_blue_fuels = 0
        total_red_fuels = 0
        blue_auto_cells = 0
        red_auto_cells = 0
        blue_teleop_cells = 0
        red_teleop_cells = 0
        
        if year == 2020:
            # 2020 Infinite Recharge scoring
            blue_auto_cells = (
                blue_breakdown.get('autoCellsBottom', 0) +
                blue_breakdown.get('autoCellsOuter', 0) +
                blue_breakdown.get('autoCellsInner', 0)
            )
            red_auto_cells = (
                red_breakdown.get('autoCellsBottom', 0) +
                red_breakdown.get('autoCellsOuter', 0) +
                red_breakdown.get('autoCellsInner', 0)
            )
            
            blue_teleop_cells = (
                blue_breakdown.get('teleopCellsBottom', 0) +
                blue_breakdown.get('teleopCellsOuter', 0) +
                blue_breakdown.get('teleopCellsInner', 0)
            )
            red_teleop_cells = (
                red_breakdown.get('teleopCellsBottom', 0) +
                red_breakdown.get('teleopCellsOuter', 0) +
                red_breakdown.get('teleopCellsInner', 0)
            )
            
            total_blue_fuels = blue_auto_cells + blue_teleop_cells
            total_red_fuels = red_auto_cells + red_teleop_cells
        elif year == 2025:
            # 2025 Reefscape scoring - adapt based on actual game pieces
            # For now, use generic scoring from breakdown if available
            # You may need to adjust these field names based on actual 2025 API structure
            blue_auto_cells = blue_breakdown.get('autoGamePieceCount', 0)
            red_auto_cells = red_breakdown.get('autoGamePieceCount', 0)
            blue_teleop_cells = blue_breakdown.get('teleopGamePieceCount', 0)
            red_teleop_cells = red_breakdown.get('teleopGamePieceCount', 0)
            total_blue_fuels = blue_auto_cells + blue_teleop_cells
            total_red_fuels = red_auto_cells + red_teleop_cells
        
        # Extract time fields from TBA API
        predicted_match_time = match_data.get('predicted_time', 0) or 0
        start_match_time = match_data.get('actual_time', 0) or 0
        end_match_time = match_data.get('post_result_time', 0) or 0
        
        # Map climb values based on year
        def map_climb(endgame_value, year):
            if year == 2020:
                # 2020: Park->L1, Hang->L3
                if endgame_value == 'Park':
                    return 'L1'
                elif endgame_value == 'Hang':
                    return 'L3'
            elif year == 2025:
                # 2025: Map based on actual endgame values
                # Adjust these mappings based on 2025 game manual
                if endgame_value in ['Shallow', 'Park']:
                    return 'L1'
                elif endgame_value == 'Deep':
                    return 'L2'
                elif endgame_value in ['Cage', 'High']:
                    return 'L3'
            return 'None'
        
        match, created = Match.objects.update_or_create(
            competition=competition,
            match_type=match_type,
            set_number=set_number,
            match_number=match_number,
            defaults={
                'predicted_match_time': predicted_match_time,
                'start_match_time': start_match_time,
                'end_match_time': end_match_time,
                'blue_team_1': blue_teams[0],
                'blue_team_2': blue_teams[1],
                'blue_team_3': blue_teams[2],
                'red_team_1': red_teams[0],
                'red_team_2': red_teams[1],
                'red_team_3': red_teams[2],
                'total_points': blue_score + red_score,
                'total_blue_fuels': total_blue_fuels,
                'total_red_fuels': total_red_fuels,
                'blue_1_climb': map_climb(blue_breakdown.get('endgameRobot1', 'None'), year),
                'blue_2_climb': map_climb(blue_breakdown.get('endgameRobot2', 'None'), year),
                'blue_3_climb': map_climb(blue_breakdown.get('endgameRobot3', 'None'), year),
                'red_1_climb': map_climb(red_breakdown.get('endgameRobot1', 'None'), year),
                'red_2_climb': map_climb(red_breakdown.get('endgameRobot2', 'None'), year),
                'red_3_climb': map_climb(red_breakdown.get('endgameRobot3', 'None'), year),
                'calculated_points': blue_score + red_score,
            }
        )
        
        if created:
            self.stdout.write(f'    Created match: {match_data.get("key")}')
        
        return blue_teams + red_teams

    def get_or_create_team(self, team_key):
        team_number = int(team_key.replace('frc', ''))
        team, created = Team.objects.get_or_create(
            number=team_number,
            defaults={'name': f'Team {team_number}'}
        )
        return team
    
    def calculate_and_set_offsets(self, competition, stream_time_day_1, stream_time_day_2, stream_time_day_3):
        """Calculate offsets based on first match of each day and stream timestamps"""
        from django.db.models import Min
        
        # Get all matches with start times, ordered by start time
        matches = Match.objects.filter(
            competition=competition,
            start_match_time__gt=0
        ).order_by('start_match_time')
        
        if not matches.exists():
            self.stdout.write(self.style.WARNING('  No matches with start times found, cannot calculate offsets'))
            return
        
        # Get first match time to determine day boundaries
        first_match_time = matches.first().start_match_time
        day_1_end = first_match_time + (12 * 3600)  # 12 hours after first match
        day_2_end = day_1_end + (24 * 3600)  # 24 hours after day 1 end
        
        # Find first match of each day
        first_match_day_1 = matches.filter(start_match_time__lt=day_1_end).first()
        first_match_day_2 = matches.filter(start_match_time__gte=day_1_end, start_match_time__lt=day_2_end).first()
        first_match_day_3 = matches.filter(start_match_time__gte=day_2_end).first()
        
        # Calculate offsets: offset = unix_timestamp - stream_time
        if first_match_day_1:
            competition.offset_stream_time_to_unix_timestamp_day_1 = first_match_day_1.start_match_time - stream_time_day_1
            self.stdout.write(f'  Set day 1 offset: {competition.offset_stream_time_to_unix_timestamp_day_1}')
        
        if first_match_day_2:
            competition.offset_stream_time_to_unix_timestamp_day_2 = first_match_day_2.start_match_time - stream_time_day_2
            self.stdout.write(f'  Set day 2 offset: {competition.offset_stream_time_to_unix_timestamp_day_2}')
        
        if first_match_day_3:
            competition.offset_stream_time_to_unix_timestamp_day_3 = first_match_day_3.start_match_time - stream_time_day_3
            self.stdout.write(f'  Set day 3 offset: {competition.offset_stream_time_to_unix_timestamp_day_3}')
        
        competition.save()
        self.stdout.write(self.style.SUCCESS('  ✓ Offsets calculated and saved'))
    
    def create_team_infos(self, teams, competition):
        for team in teams:
            team_info, created = TeamInfo.objects.get_or_create(
                team=team,
                competition=competition,
                defaults={
                    'ranking_points': 0.0,
                    'tie': 0,
                    'win': 0,
                    'lose': 0,
                }
            )
            if created:
                self.stdout.write(f'    Created TeamInfo for Team {team.number} in {competition.name}')
