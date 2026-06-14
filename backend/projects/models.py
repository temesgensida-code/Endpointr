import uuid
from django.db import models


class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    owner_clerk_id = models.CharField(max_length=255, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


ROLE_CHOICES = [
    ("owner", "Owner"),
    ("admin", "Admin"),
    ("editor", "Editor"),
    ("viewer", "Viewer"),
]


class ProjectMember(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="members")
    clerk_user_id = models.CharField(max_length=255, db_index=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="viewer")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("project", "clerk_user_id")]

    def __str__(self):
        return f"{self.clerk_user_id} in {self.project} as {self.role}"


class ApiKey(models.Model):
    """Per-project API key for CI/CD-triggered runs."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="api_keys")
    name = models.CharField(max_length=255)
    key_hash = models.CharField(max_length=128, unique=True)
    prefix = models.CharField(max_length=12)
    scopes = models.JSONField(default=list)
    created_by_clerk_id = models.CharField(max_length=255, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.prefix}...)"
