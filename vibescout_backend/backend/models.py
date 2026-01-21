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


class TeamInfo(models.Model):
    DRIVETRAIN_CHOICES = [
        ('swerve', 'Swerve'),
        ('tank', 'Tank'),
        ('mecanum', 'Mecanum'),
        ('other', 'Other'),
    ]
    
    INTAKE_CHOICES = [
        ('inbumper', 'In Bumper'),
        ('overbumper', 'Over Bumper'),
    ]
    
    RANGE_CHOICES = [
        ('alliance', 'Alliance'),
        ('neutral', 'Neutral'),
        ('opponent', 'Opponent'),
    ]
    
    CLIMBER_CHOICES = [
        ('l1', 'Level 1'),
        ('l2', 'Level 2'),
        ('l3', 'Level 3'),
        ('none', 'None'),
    ]
    
    ranking_points = models.FloatField(default=0.0)
    tie = models.IntegerField(default=0)
    win = models.IntegerField(default=0)
    lose = models.IntegerField(default=0)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='results')
    competition = models.ForeignKey(Competition, on_delete=models.CASCADE, related_name='results')

    picture = models.ImageField(upload_to='team_pictures/', blank=True, null=True)
    prescout_drivetrain = models.CharField(max_length=20, choices=DRIVETRAIN_CHOICES, blank=True, null=True)
    prescout_hopper_size = models.IntegerField(default=0, blank=True, null=True)
    prescout_intake_type = models.CharField(max_length=20, choices=INTAKE_CHOICES, blank=True, null=True)
    prescout_rotate_yaw = models.BooleanField(default=False)
    prescout_rotate_pitch = models.BooleanField(default=False)
    prescout_self_reported_accuracy = models.FloatField(default=0.0, blank=True, null=True)
    prescout_unload_time = models.FloatField(default=0.0, blank=True, null=True)
    prescout_range = models.CharField(max_length=20, choices=RANGE_CHOICES, blank=True, null=True)
    prescout_climber = models.CharField(max_length=20, choices=CLIMBER_CHOICES, blank=True, null=True)
    prescout_climber_auto = models.BooleanField(default=False)
    prescout_self_reported_auto_shoot = models.IntegerField(default=0)
    prescout_additional_comments = models.TextField(blank=True, null=True)

    accuracy = models.FloatField(default=0.0, blank=True, null=True)
    avg_fuel_scored = models.FloatField(default=0.0, blank=True, null=True)
    avg_shuttle = models.FloatField(default=0.0, blank=True, null=True)
    avg_auto_fuel = models.FloatField(default=0.0, blank=True, null=True)
    avg_climb_points = models.FloatField(default=0.0, blank=True, null=True)
    
    
    def __str__(self):
        return f"{self.team} - {self.ranking_points} RP"

    class Meta:
        ordering = ['-ranking_points']
        unique_together = ['team', 'competition']


class Match(models.Model):
    competition = models.ForeignKey(Competition, on_delete=models.CASCADE, related_name='matches')
    match_number = models.IntegerField()
    blue_team_1 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='blue_1_matches')
    blue_team_2 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='blue_2_matches')
    blue_team_3 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='blue_3_matches')
    red_team_1 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='red_1_matches')
    red_team_2 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='red_2_matches')
    red_team_3 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='red_3_matches')
    
    total_points = models.IntegerField(default=0)
    total_blue_fuels = models.IntegerField(default=0)
    total_red_fuels = models.IntegerField(default=0)
    
    blue_1_auto_fuel = models.IntegerField(default=0)
    blue_2_auto_fuel = models.IntegerField(default=0)
    blue_3_auto_fuel = models.IntegerField(default=0)
    red_1_auto_fuel = models.IntegerField(default=0)
    red_2_auto_fuel = models.IntegerField(default=0)
    red_3_auto_fuel = models.IntegerField(default=0)
    
    blue_1_teleop_fuel = models.IntegerField(default=0)
    blue_2_teleop_fuel = models.IntegerField(default=0)
    blue_3_teleop_fuel = models.IntegerField(default=0)
    red_1_teleop_fuel = models.IntegerField(default=0)
    red_2_teleop_fuel = models.IntegerField(default=0)
    red_3_teleop_fuel = models.IntegerField(default=0)
    
    blue_1_fuel_scored = models.IntegerField(default=0)
    blue_2_fuel_scored = models.IntegerField(default=0)
    blue_3_fuel_scored = models.IntegerField(default=0)
    red_1_fuel_scored = models.IntegerField(default=0)
    red_2_fuel_scored = models.IntegerField(default=0)
    red_3_fuel_scored = models.IntegerField(default=0)
    
    calculated_points = models.IntegerField(default=0)
    
    def __str__(self):
        return f"Match - {self.competition.name}"
    
    class Meta:
        ordering = ['-id']
        verbose_name_plural = 'Matches'
