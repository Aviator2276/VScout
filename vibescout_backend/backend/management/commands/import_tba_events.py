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
        
        competition, created = Competition.objects.get_or_create(
            code=event_key,
            defaults={'name': event_info['name']}
        )
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
        
        # Map 2020 climb values to 2026 format: Park->L1, Hang->L3
        def map_climb(endgame_value):
            if endgame_value == 'Park':
                return 'L1'
            elif endgame_value == 'Hang':
                return 'L3'
            else:
                return 'None'
        
        match, created = Match.objects.update_or_create(
            competition=competition,
            match_type=match_type,
            set_number=set_number,
            match_number=match_number,
            defaults={
                'blue_team_1': blue_teams[0],
                'blue_team_2': blue_teams[1],
                'blue_team_3': blue_teams[2],
                'red_team_1': red_teams[0],
                'red_team_2': red_teams[1],
                'red_team_3': red_teams[2],
                'total_points': blue_score + red_score,
                'total_blue_fuels': total_blue_fuels,
                'total_red_fuels': total_red_fuels,
                'blue_1_climb': map_climb(blue_breakdown.get('endgameRobot1', 'None')),
                'blue_2_climb': map_climb(blue_breakdown.get('endgameRobot2', 'None')),
                'blue_3_climb': map_climb(blue_breakdown.get('endgameRobot3', 'None')),
                'red_1_climb': map_climb(red_breakdown.get('endgameRobot1', 'None')),
                'red_2_climb': map_climb(red_breakdown.get('endgameRobot2', 'None')),
                'red_3_climb': map_climb(red_breakdown.get('endgameRobot3', 'None')),
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
