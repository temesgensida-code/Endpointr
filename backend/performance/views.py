from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from rest_framework import serializers

from projects.permissions import IsProjectMember, IsProjectEditor
from .models import PerfTestConfig, PerfTestRun
from workflows.nats_client import publish_event


# Inline serializers (kept simple; extract to serializers.py as needed)
class PerfConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerfTestConfig
        fields = ["id", "project", "name", "type", "target_request_id", "config", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class PerfRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerfTestRun
        fields = ["id", "config", "status", "started_at", "finished_at", "summary", "created_at"]
        read_only_fields = ["id", "status", "started_at", "finished_at", "summary", "created_at"]


NATS_SUBJECT_MAP = {
    "load": "runs.perf.requested",
    "stress": "runs.perf.requested",
    "rate_limit": "runs.perf.requested",
    "fuzz": "runs.perf.requested",
}


class PerfConfigListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        test_type = request.GET.get("type")
        qs = PerfTestConfig.objects.filter(project_id=project_pk)
        if test_type:
            qs = qs.filter(type=test_type)
        return Response(PerfConfigSerializer(qs, many=True).data)

    def post(self, request, project_pk):
        data = {**request.data, "project": str(project_pk)}
        ser = PerfConfigSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        instance = ser.save()
        return Response(PerfConfigSerializer(instance).data, status=201)


class PerfConfigDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def _get(self, project_pk, pk):
        try:
            return PerfTestConfig.objects.get(pk=pk, project_id=project_pk)
        except PerfTestConfig.DoesNotExist:
            raise NotFound("Config not found.")

    def get(self, request, project_pk, pk):
        return Response(PerfConfigSerializer(self._get(project_pk, pk)).data)

    def patch(self, request, project_pk, pk):
        cfg = self._get(project_pk, pk)
        ser = PerfConfigSerializer(cfg, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data)

    def delete(self, request, project_pk, pk):
        self._get(project_pk, pk).delete()
        return Response(status=204)


class PerfRunView(APIView):
    """POST /projects/<project_pk>/performance/<pk>/run/ — dispatch to Go."""
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def post(self, request, project_pk, pk):
        try:
            cfg = PerfTestConfig.objects.get(pk=pk, project_id=project_pk)
        except PerfTestConfig.DoesNotExist:
            raise NotFound("Config not found.")

        run = PerfTestRun.objects.create(config=cfg, status="queued")

        subject = NATS_SUBJECT_MAP.get(cfg.type, "runs.perf.requested")
        publish_event(subject, {
            "run_id": str(run.id),
            "config_id": str(cfg.id),
            "type": cfg.type,
            "config": cfg.config,
            "project_id": str(project_pk),
        })

        return Response({"run_id": str(run.id), "status": "queued"}, status=202)


class PerfRunListView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk, pk):
        runs = PerfTestRun.objects.filter(config_id=pk, config__project_id=project_pk)
        return Response(PerfRunSerializer(runs, many=True).data)


class PerfRegressionView(APIView):
    """
    GET /projects/<project_pk>/performance/regression/
    Compare two perf run summaries.
    TODO: query TimescaleDB continuous aggregates when metrics-service is running.
    """
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        run_a_id = request.GET.get("run_a")
        run_b_id = request.GET.get("run_b")
        if not run_a_id or not run_b_id:
            return Response({"error": "run_a and run_b query params required."}, status=400)
        try:
            run_a = PerfTestRun.objects.get(pk=run_a_id, config__project_id=project_pk)
            run_b = PerfTestRun.objects.get(pk=run_b_id, config__project_id=project_pk)
        except PerfTestRun.DoesNotExist:
            raise NotFound("One or both runs not found.")

        # Basic comparison from stored summary JSON
        comparison = {
            "run_a": PerfRunSerializer(run_a).data,
            "run_b": PerfRunSerializer(run_b).data,
            "diff": _diff_summaries(run_a.summary or {}, run_b.summary or {}),
        }
        return Response(comparison)


def _diff_summaries(a: dict, b: dict) -> dict:
    metrics = ["p50_latency_ms", "p95_latency_ms", "p99_latency_ms", "error_rate", "throughput_rps"]
    result = {}
    for m in metrics:
        va, vb = a.get(m), b.get(m)
        if va is not None and vb is not None:
            try:
                result[m] = {"run_a": va, "run_b": vb, "delta_pct": round(((vb - va) / va) * 100, 2)}
            except ZeroDivisionError:
                result[m] = {"run_a": va, "run_b": vb, "delta_pct": None}
    return result
