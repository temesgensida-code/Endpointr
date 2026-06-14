from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from rest_framework import serializers
from django.utils import timezone

from projects.permissions import IsProjectMember, IsProjectEditor
from .models import Monitor, Incident


class MonitorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Monitor
        fields = [
            "id", "project", "name", "protocol", "url", "method", "headers", "body",
            "interval_seconds", "sla_target", "active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class IncidentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Incident
        fields = ["id", "monitor", "status", "started_at", "resolved_at", "cause", "details"]
        read_only_fields = ["id", "started_at"]


class MonitorListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        qs = Monitor.objects.filter(project_id=project_pk)
        active_only = request.GET.get("active")
        if active_only:
            qs = qs.filter(active=active_only.lower() in ("1", "true", "yes"))
        return Response(MonitorSerializer(qs, many=True).data)

    def post(self, request, project_pk):
        data = {**request.data, "project": str(project_pk)}
        ser = MonitorSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        instance = ser.save()
        return Response(MonitorSerializer(instance).data, status=201)


class MonitorDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def _get(self, project_pk, pk):
        try:
            return Monitor.objects.get(pk=pk, project_id=project_pk)
        except Monitor.DoesNotExist:
            raise NotFound("Monitor not found.")

    def get(self, request, project_pk, pk):
        return Response(MonitorSerializer(self._get(project_pk, pk)).data)

    def patch(self, request, project_pk, pk):
        mon = self._get(project_pk, pk)
        ser = MonitorSerializer(mon, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data)

    def delete(self, request, project_pk, pk):
        self._get(project_pk, pk).delete()
        return Response(status=204)


class MonitorStatusView(APIView):
    """GET /projects/<project_pk>/monitoring/status/ — summary of all monitors."""
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        monitors = Monitor.objects.filter(project_id=project_pk)
        open_incidents = Incident.objects.filter(
            monitor__project_id=project_pk, status="open"
        ).select_related("monitor")

        incident_by_monitor = {}
        for inc in open_incidents:
            incident_by_monitor.setdefault(str(inc.monitor_id), []).append(
                IncidentSerializer(inc).data
            )

        data = []
        for mon in monitors:
            data.append({
                **MonitorSerializer(mon).data,
                "open_incidents": incident_by_monitor.get(str(mon.id), []),
                "operational": str(mon.id) not in incident_by_monitor,
            })
        return Response(data)


class IncidentListView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk, monitor_pk):
        qs = Incident.objects.filter(monitor_id=monitor_pk, monitor__project_id=project_pk)
        status_filter = request.GET.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(IncidentSerializer(qs, many=True).data)


class IncidentResolveView(APIView):
    """POST /projects/<project_pk>/monitoring/<monitor_pk>/incidents/<pk>/resolve/"""
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def post(self, request, project_pk, monitor_pk, pk):
        try:
            incident = Incident.objects.get(
                pk=pk, monitor_id=monitor_pk, monitor__project_id=project_pk
            )
        except Incident.DoesNotExist:
            raise NotFound("Incident not found.")
        incident.status = "resolved"
        incident.resolved_at = timezone.now()
        incident.save(update_fields=["status", "resolved_at"])
        return Response(IncidentSerializer(incident).data)
