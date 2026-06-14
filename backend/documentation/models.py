import uuid
from django.db import models

from projects.models import Project


class ApiSpec(models.Model):
    """Versioned OpenAPI spec attached to a project."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="api_specs")
    version = models.CharField(max_length=100)  # e.g. "1.0.0", "2025-06-01"
    title = models.CharField(max_length=255, blank=True)
    openapi_json = models.JSONField()
    created_by_clerk_id = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = [("project", "version")]

    def __str__(self):
        return f"{self.project} v{self.version}"
