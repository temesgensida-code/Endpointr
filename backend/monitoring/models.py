import uuid
from django.db import models
from projects.models import Project


PROTOCOL_CHOICES = [("http", "HTTP"), ("graphql", "GraphQL")]
INCIDENT_STATUS = [("open", "Open"), ("resolved", "Resolved")]


class Monitor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="monitors")
    name = models.CharField(max_length=255)
    protocol = models.CharField(max_length=20, choices=PROTOCOL_CHOICES, default="http")
    url = models.URLField(max_length=2048)
    method = models.CharField(max_length=10, default="GET")
    headers = models.JSONField(default=dict)
    body = models.JSONField(null=True, blank=True)
    interval_seconds = models.IntegerField(default=60)
    sla_target = models.DecimalField(max_digits=5, decimal_places=2, default=99.9)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.url})"


class Incident(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    monitor = models.ForeignKey(Monitor, on_delete=models.CASCADE, related_name="incidents")
    status = models.CharField(max_length=20, choices=INCIDENT_STATUS, default="open")
    started_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    cause = models.TextField(blank=True)
    details = models.JSONField(null=True, blank=True)  # last probe response, error

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"Incident on {self.monitor.name} [{self.status}]"
