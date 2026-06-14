import uuid
from django.db import models

from projects.models import Project


class Workflow(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="workflows")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # React Flow-compatible DAG: {nodes: [...], edges: [...]}
    definition = models.JSONField(default=dict)
    created_by_clerk_id = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


RUN_STATUS = [
    ("queued", "Queued"),
    ("running", "Running"),
    ("passed", "Passed"),
    ("failed", "Failed"),
    ("partial", "Partial"),
    ("cancelled", "Cancelled"),
]


class WorkflowRun(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name="runs")
    status = models.CharField(max_length=20, choices=RUN_STATUS, default="queued")
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    triggered_by_clerk_id = models.CharField(max_length=255, blank=True)
    result_summary = models.JSONField(null=True, blank=True)
    # total/passed/failed assertion counts, per-node results
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.workflow.name} run {self.id} [{self.status}]"
