from django.db import models


class Team(models.Model):
    number = models.IntegerField(unique=True)
    name = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.number} - {self.name}"

    class Meta:
        ordering = ['number']


class Competition(models.Model):
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']


class CompetitionResult(models.Model):
    ranking_points = models.FloatField()
    tie = models.IntegerField(default=0)
    win = models.IntegerField(default=0)
    lose = models.IntegerField(default=0)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='results')

    def __str__(self):
        return f"{self.team} - {self.ranking_points} RP"

    class Meta:
        ordering = ['-ranking_points']
