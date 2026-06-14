"""
Audit signals — auto-log all tracked model changes.
Thread-local clerk_id is set by AuditActorMiddleware on each request.
"""
import json
import logging
import threading
from django.db.models.signals import post_save, pre_delete
from django.core.serializers.json import DjangoJSONEncoder

logger = logging.getLogger(__name__)

_local = threading.local()
_TRACKED = {}


def set_current_clerk_id(clerk_id: str):
    _local.clerk_id = clerk_id


def get_current_clerk_id() -> str:
    return getattr(_local, "clerk_id", "")


def _register_tracked_models():
    from django.apps import apps
    tracked = {
        "projects": ["Project", "ProjectMember"],
        "api_collections": ["Collection", "Folder", "APIRequestDefinition", "Environment", "Assertion"],
        "workflows": ["Workflow", "WorkflowRun"],
        "performance": ["PerfTestConfig", "PerfTestRun"],
        "monitoring": ["Monitor", "Incident"],
        "contracts": ["SchemaSnapshot", "SchemaDiff"],
        "documentation": ["ApiSpec"],
    }
    for app_label, names in tracked.items():
        for name in names:
            try:
                model = apps.get_model(app_label, name)
                _TRACKED[model] = f"{app_label}.{name.lower()}"
            except LookupError:
                pass


def _serialize(instance) -> dict:
    try:
        data = {}
        for field in instance._meta.concrete_fields:
            val = getattr(instance, field.attname, None)
            data[field.attname] = val
        return json.loads(json.dumps(data, cls=DjangoJSONEncoder))
    except Exception:
        return {}


def _get_project_id(instance):
    """Return project_id or None. Return None if instance IS a Project (self-delete)."""
    from projects.models import Project as ProjectModel
    if isinstance(instance, ProjectModel):
        return None  # don't reference self on project delete
    for attr in ("project_id",):
        val = getattr(instance, attr, None)
        if val:
            return val
    if hasattr(instance, "collection"):
        try:
            return instance.collection.project_id
        except Exception:
            pass
    return None


def _write_log(instance, action, diff=None):
    from audit.models import AuditLog
    try:
        AuditLog.objects.create(
            project_id=_get_project_id(instance),
            entity_type=_TRACKED.get(type(instance), type(instance).__name__.lower()),
            entity_id=str(instance.pk),
            action=action,
            diff=diff,
            actor_clerk_id=get_current_clerk_id(),
        )
    except Exception as exc:
        logger.warning("Failed to write audit log: %s", exc)


def connect_signals():
    _register_tracked_models()
    for model in _TRACKED:
        post_save.connect(_on_save, sender=model, weak=False)
        pre_delete.connect(_on_delete, sender=model, weak=False)


def _on_save(sender, instance, created, **kwargs):
    _write_log(instance, "created" if created else "updated",
               None if created else _serialize(instance))


def _on_delete(sender, instance, **kwargs):
    _write_log(instance, "deleted", _serialize(instance))
