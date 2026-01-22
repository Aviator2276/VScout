from ninja import NinjaAPI
from typing import List
from django.shortcuts import get_object_or_404
from .models import Team, Competition, TeamInfo, Match, ShotTiming
from .schemas import (
    TeamSchema, CompetitionSchema,
    TeamInfoSchema, 
    PrescouttingUpdateSchema, MatchSchema,
    ShotTimingSchema, ShotTimingCreateSchema
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
    from django.db.models import Case, When, IntegerField
    
    competition = get_object_or_404(Competition, code=code)
    
    match_type_order = Case(
        When(match_type='qualification', then=1),
        When(match_type='quarterfinal', then=2),
        When(match_type='semifinal', then=3),
        When(match_type='final', then=4),
        default=5,
        output_field=IntegerField()
    )
    
    return Match.objects.select_related(
        'competition', 'blue_team_1', 'blue_team_2', 'blue_team_3',
        'red_team_1', 'red_team_2', 'red_team_3'
    ).filter(competition=competition).order_by(match_type_order, 'match_number')

@api.post("/shot-timings", response=ShotTimingSchema)
def create_shot_timing(request, competition_code: str, match_number: int, team_number: int, payload: ShotTimingCreateSchema):
    competition = get_object_or_404(Competition, code=competition_code)
    match = get_object_or_404(Match, competition=competition, match_number=match_number)
    team = get_object_or_404(Team, number=team_number)
    shot_timing = ShotTiming.objects.create(
        match=match,
        team=team,
        start_shot_time=payload.start_shot_time,
        end_shot_time=payload.end_shot_time
    )
    return shot_timing

@api.get("/scary-api")
def scary_api(request):
    return {"scary": "67"}

