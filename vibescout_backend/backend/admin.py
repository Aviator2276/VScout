from django.contrib import admin
from .models import Team, Competition, TeamInfo


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
