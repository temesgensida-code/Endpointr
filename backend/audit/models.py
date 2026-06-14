from django.db import models
from projects.models import Project


class AuditLog(models.Model):
    """
    Immutable audit trail — rows can never be edited or directly deleted by
    application code. The project FK uses SET_NULL so audit history survives
    project deletion (for compliance/archival purposes).
    """
    project = models.ForeignKey(
        Project, on_delete=models.SET_NULL,   # ← SET_NULL, not CASCADE
        related_name="audit_logs", null=True, blank=True
    )
    entity_type = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=100)
    action = models.CharField(max_length=20)  # created | updated | deleted
    diff = models.JSONField(null=True, blank=True)
    actor_clerk_id = models.CharField(max_length=255, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} {self.entity_type}/{self.entity_id} by {self.actor_clerk_id}"

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("AuditLog entries are immutable — cannot update.")
        super().save(*args, **kwargs)

    def delete(self, using=None, keep_parents=False):
        # Allow Django's internal collector (CASCADE/SET_NULL) — only block
        # direct .delete() calls from application code.
        import traceback
        stack = traceback.extract_stack()
        caller_frames = [f.filename for f in stack if 'django/db/models/deletion.py' in f.filename]
        if caller_frames:
            # Called by Django's ORM collector — allow for SET_NULL sweep
            return super().delete(using=using, keep_parents=keep_parents)
        raise ValueError("AuditLog entries cannot be deleted by application code.")
