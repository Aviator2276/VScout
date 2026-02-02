from django.contrib.auth.models import User
from django.db import models


class Team(models.Model):
    number = models.IntegerField(unique=True)
    name = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.number} - {self.name}"

    class Meta:
        ordering = ["number"]


class Competition(models.Model):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    offset_stream_time_to_unix_timestamp_day_1 = models.IntegerField(
        default=0
    )  # in seconds
    offset_stream_time_to_unix_timestamp_day_2 = models.IntegerField(
        default=0
    )  # in seconds
    offset_stream_time_to_unix_timestamp_day_3 = models.IntegerField(
        default=0
    )  # in seconds
    stream_link_day_1 = models.CharField(max_length=255, blank=True, null=True)
    stream_link_day_2 = models.CharField(max_length=255, blank=True, null=True)
    stream_link_day_3 = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]


class TeamInfo(models.Model):
    DRIVETRAIN_CHOICES = [
        ("swerve", "Swerve"),
        ("tank", "Tank"),
        ("mecanum", "Mecanum"),
        ("other", "Other"),
    ]

    INTAKE_CHOICES = [
        ("inbumper", "In Bumper"),
        ("overbumper", "Over Bumper"),
    ]

    RANGE_CHOICES = [
        ("alliance", "Alliance"),
        ("neutral", "Neutral"),
        ("opponent", "Opponent"),
    ]

    CLIMBER_CHOICES = [
        ("l1", "Level 1"),
        ("l2", "Level 2"),
        ("l3", "Level 3"),
        ("none", "None"),
    ]

    # Official rank from TBA (cached) - TBA handles all sorting
    rank = models.IntegerField(default=0, blank=True, null=True)

    # Legacy fields for compatibility
    ranking_points = models.FloatField(default=0.0)
    tie = models.IntegerField(default=0)
    win = models.IntegerField(default=0)
    lose = models.IntegerField(default=0)

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="results")
    competition = models.ForeignKey(
        Competition, on_delete=models.CASCADE, related_name="results"
    )

    picture = models.ImageField(upload_to="team_pictures/", blank=True, null=True)
    prescout_drivetrain = models.CharField(
        max_length=20, choices=DRIVETRAIN_CHOICES, blank=True, null=True
    )
    prescout_hopper_size = models.IntegerField(default=0, blank=True, null=True)
    prescout_intake_type = models.CharField(
        max_length=20, choices=INTAKE_CHOICES, blank=True, null=True
    )
    prescout_rotate_yaw = models.BooleanField(default=False)
    prescout_rotate_pitch = models.BooleanField(default=False)
    prescout_self_reported_accuracy = models.FloatField(
        default=0.0, blank=True, null=True
    )
    prescout_unload_time = models.FloatField(default=0.0, blank=True, null=True)
    prescout_range = models.CharField(
        max_length=20, choices=RANGE_CHOICES, blank=True, null=True
    )
    prescout_climber = models.CharField(
        max_length=20, choices=CLIMBER_CHOICES, blank=True, null=True
    )
    prescout_climber_auto = models.BooleanField(default=False)
    prescout_self_reported_auto_shoot = models.IntegerField(default=0)
    prescout_additional_comments = models.TextField(blank=True, null=True)

    accuracy = models.FloatField(default=0.0, blank=True, null=True)
    avg_fuel_scored = models.FloatField(default=0.0, blank=True, null=True)
    avg_shuttle = models.FloatField(default=0.0, blank=True, null=True)
    avg_auto_fuel = models.FloatField(default=0.0, blank=True, null=True)
    avg_climb_points = models.FloatField(default=0.0, blank=True, null=True)
    avg_alliance_match_points = models.FloatField(
        default=0.0, blank=True, null=True
    )  # Tiebreaker #2

    def __str__(self):
        return f"{self.team} - {self.ranking_points} RP"

    class Meta:
        ordering = ["rank"]  # Lower rank number is better (1st place = rank 1)
        unique_together = ["team", "competition"]


class Match(models.Model):
    CLIMB_CHOICES = [
        ("None", "None"),
        ("L1", "Level 1"),
        ("L2", "Level 2"),
        ("L3", "Level 3"),
    ]

    TYPE_CHOICES = [
        ("qualification", "Qualification"),
        ("quarterfinal", "Quarterfinal"),
        ("semifinal", "Semifinal"),
        ("final", "Final"),
    ]
    competition = models.ForeignKey(
        Competition, on_delete=models.CASCADE, related_name="matches"
    )
    match_number = models.IntegerField()
    set_number = models.IntegerField(default=1)
    has_played = models.BooleanField(default=False)
    match_type = models.CharField(
        max_length=20, choices=TYPE_CHOICES, default="Qualification"
    )
    blue_team_1 = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="blue_1_matches"
    )
    blue_team_2 = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="blue_2_matches"
    )
    blue_team_3 = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="blue_3_matches"
    )
    red_team_1 = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="red_1_matches"
    )
    red_team_2 = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="red_2_matches"
    )
    red_team_3 = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="red_3_matches"
    )

    predicted_match_time = models.IntegerField(default=0)  # Unix timestamp
    start_match_time = models.IntegerField(default=0)  # Unix timestamp
    end_match_time = models.IntegerField(default=0)  # Unix timestamp

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

    blue_1_climb = models.CharField(
        max_length=10, choices=CLIMB_CHOICES, default="None"
    )
    blue_2_climb = models.CharField(
        max_length=10, choices=CLIMB_CHOICES, default="None"
    )
    blue_3_climb = models.CharField(
        max_length=10, choices=CLIMB_CHOICES, default="None"
    )
    red_1_climb = models.CharField(max_length=10, choices=CLIMB_CHOICES, default="None")
    red_2_climb = models.CharField(max_length=10, choices=CLIMB_CHOICES, default="None")
    red_3_climb = models.CharField(max_length=10, choices=CLIMB_CHOICES, default="None")

    calculated_points = models.IntegerField(default=0)

    # Match overview/summary fields
    blue_total_score = models.IntegerField(default=0)
    red_total_score = models.IntegerField(default=0)
    blue_ranking_points = models.IntegerField(default=0)
    red_ranking_points = models.IntegerField(default=0)
    winning_alliance = models.CharField(
        max_length=10,
        choices=[("red", "Red"), ("blue", "Blue"), ("tie", "Tie")],
        blank=True,
        null=True,
    )

    # Additional match statistics
    blue_auto_points = models.IntegerField(default=0)
    red_auto_points = models.IntegerField(default=0)
    blue_teleop_points = models.IntegerField(default=0)
    red_teleop_points = models.IntegerField(default=0)
    blue_endgame_points = models.IntegerField(default=0)
    red_endgame_points = models.IntegerField(default=0)

    def __str__(self):
        return f"Match {self.match_number} - {self.competition.name}"

    class Meta:
        ordering = ["-id"]
        verbose_name_plural = "Matches"


class RobotAction(models.Model):
    ACTION_CHOICES = [
        ("traveling", "Traveling"),
        ("shooting", "Shooting"),
        ("passing", "Passing"),
        ("collecting", "Collecting"),
        ("defending", "Defending"),
        ("disabled", "Disabled"),
        ("idle", "Idle"),
        ("climbing", "Climbing"),
    ]

    match = models.ForeignKey(
        Match, on_delete=models.CASCADE, related_name="robot_actions"
    )
    team = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="robot_actions"
    )
    action_type = models.CharField(max_length=20, choices=ACTION_CHOICES)
    start_time = models.FloatField()  # Time in seconds from match start
    end_time = models.FloatField()  # Time in seconds from match start
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_actions",
    )
    notes = models.TextField(blank=True, null=True)  # Optional notes about the action
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Team {self.team.number} - Match {self.match.match_number}: {self.action_type} ({self.start_time}s - {self.end_time}s)"

    class Meta:
        ordering = ["match", "start_time"]
