"""
Internal API endpoints called by Go execution-service to update run status.
Protected by INTERNAL_API_SECRET header (not Clerk JWT).
"""
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils import timezone
import json


def _check_internal_secret(request):
    secret = getattr(settings, "INTERNAL_API_SECRET", "")
    if not secret:
        return True  # disabled in dev
    return request.headers.get("X-Internal-Secret") == secret


@csrf_exempt
@require_http_methods(["PATCH"])
def update_workflow_run(request, run_id):
    if not _check_internal_secret(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        payload = json.loads(request.body)
    except Exception:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    from workflows.models import WorkflowRun
    try:
        run = WorkflowRun.objects.get(pk=run_id)
    except WorkflowRun.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    new_status = payload.get("status")
    if new_status:
        run.status = new_status
        if new_status == "running" and not run.started_at:
            run.started_at = timezone.now()
        elif new_status in ("passed", "failed", "partial", "cancelled") and not run.finished_at:
            run.finished_at = timezone.now()

    if "result_summary" in payload:
        run.result_summary = payload["result_summary"]

    run.save()
    return JsonResponse({"ok": True, "status": run.status})
