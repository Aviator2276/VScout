from django.contrib import admin
from .models import Team, Competition, TeamInfo


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ['number', 'name']
    search_fields = ['number', 'name']


@admin.register(Competition)
class CompetitionAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']


@admin.register(TeamInfo)
class TeamInfoAdmin(admin.ModelAdmin):
    list_display = ['team', 'competition', 'ranking_points', 'win', 'lose', 'tie']
    list_filter = ['competition', 'team']
    search_fields = ['team__number', 'team__name', 'competition__name']
