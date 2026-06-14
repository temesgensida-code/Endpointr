import uuid
from django.db import models

from projects.models import Project


ASSERTION_TYPES = [
    ("status_code", "Status Code"),
    ("header", "Header"),
    ("json_path", "JSON Path"),
    ("regex", "Regex"),
    ("response_time", "Response Time"),
]


class Collection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="collections")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    tags = models.JSONField(default=list)
    created_by_clerk_id = models.CharField(max_length=255, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


class Folder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    collection = models.ForeignKey(Collection, on_delete=models.CASCADE, related_name="folders")
    parent_folder = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    name = models.CharField(max_length=255)
    position = models.IntegerField(default=0)

    class Meta:
        ordering = ["position", "name"]

    def __str__(self):
        return self.name


class APIRequestDefinition(models.Model):
    """Saved request inside a collection (not the ad-hoc proxy log in API_request app)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    collection = models.ForeignKey(Collection, on_delete=models.CASCADE, related_name="requests")
    folder = models.ForeignKey(
        Folder, null=True, blank=True, on_delete=models.SET_NULL, related_name="requests"
    )
    name = models.CharField(max_length=255)
    method = models.CharField(max_length=10, default="GET")
    url = models.TextField()
    headers = models.JSONField(default=dict)
    body = models.JSONField(null=True, blank=True)
    pre_request_script = models.TextField(blank=True)
    post_response_script = models.TextField(blank=True)
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "name"]

    def __str__(self):
        return f"{self.method} {self.name}"


class Assertion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(
        APIRequestDefinition, on_delete=models.CASCADE, related_name="assertions"
    )
    type = models.CharField(max_length=20, choices=ASSERTION_TYPES)
    config = models.JSONField()  # {"path": "$.user.id", "operator": "exists"}
    position = models.IntegerField(default=0)

    class Meta:
        ordering = ["position"]

    def __str__(self):
        return f"{self.type} assertion on {self.request}"


class Environment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="environments")
    name = models.CharField(max_length=255)
    variables = models.JSONField(default=dict)  # {"BASE_URL": "https://..."}
    # secret_variables would be encrypted with django-fernet-fields or similar
    secret_variables = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.project})"
