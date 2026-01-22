from ninja import NinjaAPI
from typing import List
from django.shortcuts import get_object_or_404
from .models import Team, Competition, TeamInfo, Match
from .schemas import (
    TeamSchema, CompetitionSchema,
    TeamInfoSchema, TeamInfoCreateSchema, TeamInfoUpdateSchema,
    PrescouttingUpdateSchema, MatchSchema, MatchCreateSchema, MatchUpdateSchema
)

api = NinjaAPI()


@api.get("/health")
def health(request):
    return {"status": "healthy"}

@api.get("/competitions", response=List[CompetitionSchema])
def list_competitions(request):
    return Competition.objects.all()


@api.get("/competitions/{code}", response=CompetitionSchema)
def get_competition(request, code: str):
    return get_object_or_404(Competition, code=code)


@api.get("/team-info", response=List[TeamInfoSchema])
def list_team_info(request, competition_code: str, team_number: int = None):
    competition = get_object_or_404(Competition, code=competition_code)
    queryset = TeamInfo.objects.select_related('team', 'competition').filter(competition=competition)
    if team_number:
        team = get_object_or_404(Team, number=team_number)
        queryset = queryset.filter(team=team)
    return queryset


@api.patch("/team-info/prescouting", response=TeamInfoSchema)
def update_prescouting(request, competition_code: str, team_number: int, payload: PrescouttingUpdateSchema):
    competition = get_object_or_404(Competition, code=competition_code)
    team = get_object_or_404(Team, number=team_number)
    team_info = get_object_or_404(TeamInfo, team=team, competition=competition)
    for attr, value in payload.dict(exclude_unset=True).items():
        setattr(team_info, attr, value)
    team_info.save()
    return team_info


@api.get("/teams/{team_number}/competitions", response=List[CompetitionSchema])
def get_team_competitions(request, team_number: int):
    team = get_object_or_404(Team, number=team_number)
    return Competition.objects.filter(results__team=team).distinct()


@api.get("/competitions/{code}/teams", response=List[TeamSchema])
def get_competition_teams(request, code: str):
    competition = get_object_or_404(Competition, code=code)
    return Team.objects.filter(results__competition=competition).distinct().order_by('number')


@api.get("/competitions/{code}/matches", response=List[MatchSchema])
def get_competition_matches_by_code(request, code: str):
    competition = get_object_or_404(Competition, code=code)
    return Match.objects.select_related(
        'competition', 'blue_team_1', 'blue_team_2', 'blue_team_3',
        'red_team_1', 'red_team_2', 'red_team_3'
    ).filter(competition=competition).order_by('match_number')

