import time
import requests
from django.utils import timezone
from .models import Monitor, Incident, MonitorProbeLog


def execute_single_probe(monitor: Monitor) -> MonitorProbeLog:
    """Executes an HTTP/GraphQL probe for a Monitor instance and manages Incident lifecycle."""
    headers = monitor.headers or {}
    url = monitor.url
    method = monitor.method or "GET"
    body = monitor.body

    start_time = time.time()
    success = False
    status_code = None
    error_message = ""

    try:
        if monitor.protocol == "graphql":
            headers["Content-Type"] = "application/json"
            resp = requests.post(url, json=body, headers=headers, timeout=10)
        else:
            if method.upper() == "POST":
                resp = requests.post(url, json=body, headers=headers, timeout=10)
            elif method.upper() == "PUT":
                resp = requests.put(url, json=body, headers=headers, timeout=10)
            elif method.upper() == "PATCH":
                resp = requests.patch(url, json=body, headers=headers, timeout=10)
            elif method.upper() == "DELETE":
                resp = requests.delete(url, headers=headers, timeout=10)
            else:
                resp = requests.get(url, headers=headers, timeout=10)

        status_code = resp.status_code
        latency_ms = int((time.time() - start_time) * 1000)

        if 200 <= status_code < 400:
            success = True
        else:
            error_message = f"HTTP Status {status_code}"

    except requests.RequestException as e:
        latency_ms = int((time.time() - start_time) * 1000)
        error_message = str(e)

    # 1. Create probe log
    log = MonitorProbeLog.objects.create(
        monitor=monitor,
        status_code=status_code,
        latency_ms=latency_ms,
        success=success,
        error_message=error_message,
    )

    # 2. Manage Incident Lifecycle
    open_incident = Incident.objects.filter(monitor=monitor, status="open").first()

    if not success:
        if not open_incident:
            Incident.objects.create(
                monitor=monitor,
                status="open",
                cause=error_message,
                details={
                    "status_code": status_code,
                    "latency_ms": latency_ms,
                    "error": error_message,
                    "timestamp": timezone.now().isoformat(),
                },
            )
    else:
        if open_incident:
            open_incident.status = "resolved"
            open_incident.resolved_at = timezone.now()
            open_incident.save(update_fields=["status", "resolved_at"])

    return log
