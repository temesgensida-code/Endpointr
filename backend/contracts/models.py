import uuid
from django.db import models
from projects.models import Project


class SchemaSnapshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="schema_snapshots")
    endpoint_path = models.CharField(max_length=1024)
    method = models.CharField(max_length=10)
    schema_json = models.JSONField()  # JSON Schema or extracted from OpenAPI response
    source = models.CharField(max_length=50, blank=True)  # "manual" | "monitoring" | "import"
    captured_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-captured_at"]

    def __str__(self):
        return f"{self.method} {self.endpoint_path} @ {self.captured_at}"


class SchemaDiff(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="schema_diffs")
    old_snapshot = models.ForeignKey(
        SchemaSnapshot, on_delete=models.SET_NULL, null=True, related_name="diffs_as_old"
    )
    new_snapshot = models.ForeignKey(
        SchemaSnapshot, on_delete=models.SET_NULL, null=True, related_name="diffs_as_new"
    )
    diff_json = models.JSONField()       # added/removed/changed fields
    compatibility_score = models.DecimalField(max_digits=5, decimal_places=2, null=True)
    breaking = models.BooleanField(default=False)
    # Risk impact: affected_collections, affected_tests, risk_score
    impact_json = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Diff {self.id} breaking={self.breaking} score={self.compatibility_score}"
