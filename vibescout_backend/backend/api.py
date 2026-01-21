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


@api.get("/teams", response=List[TeamSchema])
def list_teams(request):
    return Team.objects.all()


@api.get("/teams/{team_id}", response=TeamSchema)
def get_team(request, team_id: int):
    return get_object_or_404(Team, id=team_id)


@api.get("/competitions", response=List[CompetitionSchema])
def list_competitions(request):
    return Competition.objects.all()


@api.get("/competitions/{competition_id}", response=CompetitionSchema)
def get_competition(request, competition_id: int):
    return get_object_or_404(Competition, id=competition_id)


@api.get("/team-info", response=List[TeamInfoSchema])
def list_team_info(request, team_id: int = None, competition_id: int = None):
    queryset = TeamInfo.objects.select_related('team', 'competition').all()
    if team_id:
        queryset = queryset.filter(team_id=team_id)
    if competition_id:
        queryset = queryset.filter(competition_id=competition_id)
    return queryset


@api.get("/team-info/{team_info_id}", response=TeamInfoSchema)
def get_team_info(request, team_info_id: int):
    return get_object_or_404(TeamInfo.objects.select_related('team', 'competition'), id=team_info_id)


@api.patch("/team-info/{team_info_id}/prescouting", response=TeamInfoSchema)
def update_prescouting(request, team_info_id: int, payload: PrescouttingUpdateSchema):
    team_info = get_object_or_404(TeamInfo, id=team_info_id)
    for attr, value in payload.dict(exclude_unset=True).items():
        setattr(team_info, attr, value)
    team_info.save()
    return team_info


@api.get("/teams/{team_id}/competitions", response=List[CompetitionSchema])
def get_team_competitions(request, team_id: int):
    team = get_object_or_404(Team, id=team_id)
    return Competition.objects.filter(results__team=team).distinct()


@api.get("/competitions/{competition_id}/teams", response=List[TeamSchema])
def get_competition_teams(request, competition_id: int):
    competition = get_object_or_404(Competition, id=competition_id)
    return Team.objects.filter(results__competition=competition).distinct()


@api.get("/competitions/{competition_id}/leaderboard", response=List[TeamInfoSchema])
def get_competition_leaderboard(request, competition_id: int):
    return TeamInfo.objects.select_related('team', 'competition').filter(
        competition_id=competition_id
    ).order_by('-ranking_points')


@api.get("/matches", response=List[MatchSchema])
def list_matches(request, competition_id: int = None):
    queryset = Match.objects.select_related(
        'competition', 'blue_team_1', 'blue_team_2', 'blue_team_3',
        'red_team_1', 'red_team_2', 'red_team_3'
    ).all()
    if competition_id:
        queryset = queryset.filter(competition_id=competition_id)
    return queryset


@api.get("/matches/{match_id}", response=MatchSchema)
def get_match(request, match_id: int):
    return get_object_or_404(
        Match.objects.select_related(
            'competition', 'blue_team_1', 'blue_team_2', 'blue_team_3',
            'red_team_1', 'red_team_2', 'red_team_3'
        ),
        id=match_id
    )


@api.post("/matches", response=MatchSchema)
def create_match(request, payload: MatchCreateSchema):
    competition = get_object_or_404(Competition, id=payload.competition_id)
    blue_team_1 = get_object_or_404(Team, id=payload.blue_team_1_id)
    blue_team_2 = get_object_or_404(Team, id=payload.blue_team_2_id)
    blue_team_3 = get_object_or_404(Team, id=payload.blue_team_3_id)
    red_team_1 = get_object_or_404(Team, id=payload.red_team_1_id)
    red_team_2 = get_object_or_404(Team, id=payload.red_team_2_id)
    red_team_3 = get_object_or_404(Team, id=payload.red_team_3_id)
    
    data = payload.dict(exclude={
        'competition_id', 'blue_team_1_id', 'blue_team_2_id', 'blue_team_3_id',
        'red_team_1_id', 'red_team_2_id', 'red_team_3_id'
    })
    
    match = Match.objects.create(
        competition=competition,
        blue_team_1=blue_team_1,
        blue_team_2=blue_team_2,
        blue_team_3=blue_team_3,
        red_team_1=red_team_1,
        red_team_2=red_team_2,
        red_team_3=red_team_3,
        **data
    )
    return match


@api.put("/matches/{match_id}", response=MatchSchema)
def update_match(request, match_id: int, payload: MatchUpdateSchema):
    match = get_object_or_404(Match, id=match_id)
    for attr, value in payload.dict(exclude_unset=True).items():
        setattr(match, attr, value)
    match.save()
    return match


@api.delete("/matches/{match_id}")
def delete_match(request, match_id: int):
    match = get_object_or_404(Match, id=match_id)
    match.delete()
    return {"success": True}
