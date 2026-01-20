from ninja import NinjaAPI
from typing import List
from django.shortcuts import get_object_or_404
from .models import Team, Competition, TeamInfo
from .schemas import (
    TeamSchema, TeamCreateSchema, TeamUpdateSchema,
    CompetitionSchema, CompetitionCreateSchema, CompetitionUpdateSchema,
    TeamInfoSchema, TeamInfoCreateSchema, TeamInfoUpdateSchema
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


@api.post("/teams", response=TeamSchema)
def create_team(request, payload: TeamCreateSchema):
    team = Team.objects.create(**payload.dict())
    return team


@api.put("/teams/{team_id}", response=TeamSchema)
def update_team(request, team_id: int, payload: TeamUpdateSchema):
    team = get_object_or_404(Team, id=team_id)
    for attr, value in payload.dict(exclude_unset=True).items():
        setattr(team, attr, value)
    team.save()
    return team


@api.delete("/teams/{team_id}")
def delete_team(request, team_id: int):
    team = get_object_or_404(Team, id=team_id)
    team.delete()
    return {"success": True}


@api.get("/competitions", response=List[CompetitionSchema])
def list_competitions(request):
    return Competition.objects.all()


@api.get("/competitions/{competition_id}", response=CompetitionSchema)
def get_competition(request, competition_id: int):
    return get_object_or_404(Competition, id=competition_id)


@api.post("/competitions", response=CompetitionSchema)
def create_competition(request, payload: CompetitionCreateSchema):
    competition = Competition.objects.create(**payload.dict())
    return competition


@api.put("/competitions/{competition_id}", response=CompetitionSchema)
def update_competition(request, competition_id: int, payload: CompetitionUpdateSchema):
    competition = get_object_or_404(Competition, id=competition_id)
    for attr, value in payload.dict(exclude_unset=True).items():
        setattr(competition, attr, value)
    competition.save()
    return competition


@api.delete("/competitions/{competition_id}")
def delete_competition(request, competition_id: int):
    competition = get_object_or_404(Competition, id=competition_id)
    competition.delete()
    return {"success": True}


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


@api.post("/team-info", response=TeamInfoSchema)
def create_team_info(request, payload: TeamInfoCreateSchema):
    team = get_object_or_404(Team, id=payload.team_id)
    competition = get_object_or_404(Competition, id=payload.competition_id)
    
    data = payload.dict(exclude={'team_id', 'competition_id'})
    team_info = TeamInfo.objects.create(team=team, competition=competition, **data)
    return team_info


@api.put("/team-info/{team_info_id}", response=TeamInfoSchema)
def update_team_info(request, team_info_id: int, payload: TeamInfoUpdateSchema):
    team_info = get_object_or_404(TeamInfo, id=team_info_id)
    for attr, value in payload.dict(exclude_unset=True).items():
        setattr(team_info, attr, value)
    team_info.save()
    return team_info


@api.delete("/team-info/{team_info_id}")
def delete_team_info(request, team_info_id: int):
    team_info = get_object_or_404(TeamInfo, id=team_info_id)
    team_info.delete()
    return {"success": True}


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
