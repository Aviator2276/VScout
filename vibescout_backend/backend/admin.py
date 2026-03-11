import json

from django.contrib import admin
from django.utils.html import format_html

from .models import Match, Team, Competition, TeamInfo, RobotAction


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ['match_number', 'match_type', 'competition', 'has_played', 'blue_total_score', 'red_total_score', 'video_available', 'video_clipped', 'has_fuel_timeline']
    list_filter = ['competition', 'match_type', 'has_played', 'video_clipped']
    search_fields = ['match_number']
    readonly_fields = ['fuel_timeline_pretty']

    def has_fuel_timeline(self, obj):
        return obj.fuel_timeline is not None
    has_fuel_timeline.boolean = True
    has_fuel_timeline.short_description = 'Fuel Timeline'

    def fuel_timeline_pretty(self, obj):
        if obj.fuel_timeline is None:
            return '—'
        return format_html('<pre style="white-space:pre-wrap">{}</pre>', json.dumps(obj.fuel_timeline, indent=2))
    fuel_timeline_pretty.short_description = 'Fuel Timeline (JSON)'

    fieldsets = [
        (None, {
            'fields': ['competition', 'match_number', 'match_type', 'set_number', 'has_played'],
        }),
        ('Score Breakdown', {
            'fields': [
                'blue_total_score', 'red_total_score',
                'blue_auto_points', 'red_auto_points',
                'blue_teleop_points', 'red_teleop_points',
                'blue_endgame_points', 'red_endgame_points',
                'blue_penalties', 'red_penalties',
                'blue_ranking_points', 'red_ranking_points',
                'winning_alliance',
            ],
        }),
        ('Video', {
            'fields': ['video_available', 'video_clipped'],
        }),
        ('Fuel Timeline', {
            'fields': ['fuel_timeline_pretty'],
        }),
    ]


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ['number', 'name']
    search_fields = ['number', 'name']


@admin.register(Competition)
class CompetitionAdmin(admin.ModelAdmin):
    list_display = ['name', 'code']
    search_fields = ['name', 'code']
    fieldsets = [
        (None, {
            'fields': ['name', 'code'],
        }),
        ('Stream Links', {
            'fields': [
                'stream_link_day_1', 'stream_link_day_2', 'stream_link_day_3',
            ],
        }),
        ('First Match Video Position (seconds)', {
            'fields': [
                'first_match_video_position_day_1',
                'first_match_video_position_day_2',
                'first_match_video_position_day_3',
            ],
            'description': 'Seconds into the stream where the first match of each day starts (e.g. 35:17 = 2117).',
        }),
        ('Stream Offsets (computed automatically)', {
            'fields': [
                'offset_stream_time_to_unix_timestamp_day_1',
                'offset_stream_time_to_unix_timestamp_day_2',
                'offset_stream_time_to_unix_timestamp_day_3',
            ],
        }),
    ]


@admin.register(TeamInfo)
class TeamInfoAdmin(admin.ModelAdmin):
    list_display = ['team', 'competition', 'ranking_points', 'win', 'lose', 'tie']
    list_filter = ['competition', 'team']
    search_fields = ['team__number', 'team__name', 'competition__name']


@admin.register(RobotAction)
class RobotActionAdmin(admin.ModelAdmin):
    list_display = ['team', 'match', 'action_type', 'start_time', 'end_time', 'fuel', 'is_playoff', 'recorded_by']
    list_filter = ['action_type', 'is_playoff', 'match__competition', 'team']
    search_fields = ['team__number', 'team__name', 'match__match_number', 'notes']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = [
        (None, {
            'fields': ['match', 'team', 'action_type', 'is_playoff'],
        }),
        ('Timing', {
            'fields': ['start_time', 'end_time'],
        }),
        ('Details', {
            'fields': ['fuel', 'notes', 'recorded_by'],
        }),
        ('Metadata', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse'],
        }),
    ]
