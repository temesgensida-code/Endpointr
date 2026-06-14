"""
Reports & Analytics — aggregated KPI endpoints.

In production these query TimescaleDB continuous aggregates via
TIMESCALE_DSN (see settings.py). Until TimescaleDB is running the
endpoints fall back to aggregating from PerfTestRun.summary JSON
and MonitorIncident counts stored in the main Postgres DB.
"""
from django.db.models import Count, Q
from django.utils import timezone
from datetime import timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from projects.permissions import IsProjectMember
from monitoring.models import Monitor, Incident
from performance.models import PerfTestRun, PerfTestConfig
from workflows.models import WorkflowRun
from api_collections.models import Collection


class ProjectDashboardView(APIView):
    """
    GET /projects/<project_pk>/reports/dashboard/
    Returns KPI summary cards for the project overview.
    """
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        now = timezone.now()
        window = now - timedelta(days=30)

        # Collections & requests
        collections_count = Collection.objects.filter(project_id=project_pk).count()

        # Monitors
        monitors_total = Monitor.objects.filter(project_id=project_pk).count()
        monitors_active = Monitor.objects.filter(project_id=project_pk, active=True).count()
        open_incidents = Incident.objects.filter(
            monitor__project_id=project_pk, status="open"
        ).count()

        # Workflow runs (last 30 days)
        wf_runs = WorkflowRun.objects.filter(
            workflow__project_id=project_pk, created_at__gte=window
        ).aggregate(
            total=Count("id"),
            passed=Count("id", filter=Q(status="passed")),
            failed=Count("id", filter=Q(status="failed")),
        )

        # Perf test runs (last 30 days)
        perf_runs = PerfTestRun.objects.filter(
            config__project_id=project_pk, created_at__gte=window
        ).aggregate(
            total=Count("id"),
            completed=Count("id", filter=Q(status="completed")),
        )

        # Latest perf run summaries for p95 trend (last 5 completed runs)
        latest_perf = (
            PerfTestRun.objects.filter(config__project_id=project_pk, status="completed")
            .exclude(summary=None)
            .order_by("-created_at")[:5]
        )
        p95_trend = [
            {
                "run_id": str(r.id),
                "finished_at": r.finished_at,
                "p95_latency_ms": (r.summary or {}).get("p95_latency_ms"),
                "error_rate": (r.summary or {}).get("error_rate"),
            }
            for r in latest_perf
        ]

        return Response({
            "period_days": 30,
            "collections_count": collections_count,
            "monitors": {
                "total": monitors_total,
                "active": monitors_active,
                "operational": monitors_active - open_incidents,
                "open_incidents": open_incidents,
            },
            "workflow_runs": wf_runs,
            "perf_runs": perf_runs,
            "p95_latency_trend": p95_trend,
        })


class PerfSummaryView(APIView):
    """
    GET /projects/<project_pk>/reports/performance/
    Aggregated perf test metrics. Queries PerfTestRun.summary (Postgres fallback).
    TODO: wire to TimescaleDB continuous aggregates (request_metrics_1m) when
    metrics-service is running — replace _aggregate_from_postgres() with
    _aggregate_from_timescale().
    """
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        perf_type = request.GET.get("type")  # load | stress | rate_limit | fuzz
        days = int(request.GET.get("days", 7))
        window = timezone.now() - timedelta(days=days)

        qs = PerfTestRun.objects.filter(
            config__project_id=project_pk,
            status="completed",
            created_at__gte=window,
        ).select_related("config")
        if perf_type:
            qs = qs.filter(config__type=perf_type)

        summaries = []
        for run in qs.order_by("created_at"):
            s = run.summary or {}
            summaries.append({
                "run_id": str(run.id),
                "config_name": run.config.name,
                "type": run.config.type,
                "finished_at": run.finished_at,
                "p50_latency_ms": s.get("p50_latency_ms"),
                "p95_latency_ms": s.get("p95_latency_ms"),
                "p99_latency_ms": s.get("p99_latency_ms"),
                "error_rate": s.get("error_rate"),
                "throughput_rps": s.get("throughput_rps"),
                "breaking_point_vus": s.get("breaking_point_vus"),
            })

        return Response({"period_days": days, "runs": summaries})


class MonitoringSLAView(APIView):
    """
    GET /projects/<project_pk>/reports/sla/
    SLA compliance summary per monitor.
    TODO: compute uptime from request_metrics hypertable when metrics-service runs.
    """
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        monitors = Monitor.objects.filter(project_id=project_pk)
        days = int(request.GET.get("days", 30))
        window = timezone.now() - timedelta(days=days)

        result = []
        for mon in monitors:
            incidents = Incident.objects.filter(monitor=mon, started_at__gte=window)
            # Rough downtime estimate from incidents
            total_downtime_seconds = 0
            for inc in incidents:
                end = inc.resolved_at or timezone.now()
                total_downtime_seconds += (end - inc.started_at).total_seconds()

            total_seconds = days * 86400
            uptime_pct = round(
                ((total_seconds - total_downtime_seconds) / total_seconds) * 100, 3
            )
            result.append({
                "monitor_id": str(mon.id),
                "monitor_name": mon.name,
                "url": mon.url,
                "sla_target": float(mon.sla_target),
                "uptime_pct": uptime_pct,
                "compliant": uptime_pct >= float(mon.sla_target),
                "incidents_count": incidents.count(),
                "total_downtime_minutes": round(total_downtime_seconds / 60, 1),
            })

        return Response({"period_days": days, "monitors": result})
