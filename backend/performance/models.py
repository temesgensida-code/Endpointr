import uuid
from django.db import models
from projects.models import Project


PERF_TEST_TYPES = [
    ("load", "Load Test"),
    ("stress", "Stress Test"),
    ("rate_limit", "Rate Limit Test"),
    ("fuzz", "Fuzz Test"),
]

RUN_STATUS = [
    ("queued", "Queued"),
    ("running", "Running"),
    ("completed", "Completed"),
    ("failed", "Failed"),
    ("cancelled", "Cancelled"),
]


class PerfTestConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="perf_configs")
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=PERF_TEST_TYPES)
    # Reference to a saved request definition (nullable — can also embed inline)
    target_request_id = models.UUIDField(null=True, blank=True)
    config = models.JSONField()
    # Load: {vus, duration_seconds, ramp_up_seconds, target_url, method, headers, body}
    # Rate-limit: {rps, burst, duration_seconds, target_url}
    # Fuzz: {mutators: [...], base_request_id, iterations}
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({self.type})"


class PerfTestRun(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    config = models.ForeignKey(PerfTestConfig, on_delete=models.CASCADE, related_name="runs")
    status = models.CharField(max_length=20, choices=RUN_STATUS, default="queued")
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    # Final aggregates from metrics-service: p50/p95/p99, error_rate, throughput, breaking_point
    summary = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.config.name} run {self.id} [{self.status}]"
