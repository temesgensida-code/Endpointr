from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from rest_framework import serializers

from projects.permissions import IsProjectMember, IsProjectEditor
from .models import SchemaSnapshot, SchemaDiff
from .diff_engine import diff_schemas, compute_impact


class SnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchemaSnapshot
        fields = ["id", "project", "endpoint_path", "method", "schema_json", "source", "captured_at"]
        read_only_fields = ["id", "captured_at"]


class DiffSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchemaDiff
        fields = [
            "id", "project", "old_snapshot", "new_snapshot",
            "diff_json", "compatibility_score", "breaking", "impact_json", "created_at",
        ]
        read_only_fields = ["id", "diff_json", "compatibility_score", "breaking", "impact_json", "created_at"]


# ── Snapshots ─────────────────────────────────────────────────────────────────

class SnapshotListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        qs = SchemaSnapshot.objects.filter(project_id=project_pk)
        endpoint = request.GET.get("endpoint")
        if endpoint:
            qs = qs.filter(endpoint_path=endpoint)
        return Response(SnapshotSerializer(qs, many=True).data)

    def post(self, request, project_pk):
        data = {**request.data, "project": str(project_pk)}
        ser = SnapshotSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        instance = ser.save()
        return Response(SnapshotSerializer(instance).data, status=201)


# ── Diffs ─────────────────────────────────────────────────────────────────────

class DiffListView(APIView):
    """GET all diffs, POST to compute a diff between two snapshots."""
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        qs = SchemaDiff.objects.filter(project_id=project_pk)
        breaking_only = request.GET.get("breaking")
        if breaking_only:
            qs = qs.filter(breaking=True)
        return Response(DiffSerializer(qs, many=True).data)

    def post(self, request, project_pk):
        """Compute and persist a diff between two snapshot IDs."""
        old_id = request.data.get("old_snapshot_id")
        new_id = request.data.get("new_snapshot_id")
        if not old_id or not new_id:
            return Response({"error": "old_snapshot_id and new_snapshot_id required."}, status=400)

        try:
            old_snap = SchemaSnapshot.objects.get(pk=old_id, project_id=project_pk)
            new_snap = SchemaSnapshot.objects.get(pk=new_id, project_id=project_pk)
        except SchemaSnapshot.DoesNotExist:
            raise NotFound("One or both snapshots not found in this project.")

        diff = diff_schemas(old_snap.schema_json, new_snap.schema_json)
        impact = compute_impact(diff, str(project_pk))

        sd = SchemaDiff.objects.create(
            project_id=project_pk,
            old_snapshot=old_snap,
            new_snapshot=new_snap,
            diff_json=diff,
            compatibility_score=diff["compatibility_score"],
            breaking=diff["breaking"],
            impact_json=impact,
        )
        return Response(DiffSerializer(sd).data, status=201)


class DiffDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk, pk):
        try:
            sd = SchemaDiff.objects.get(pk=pk, project_id=project_pk)
        except SchemaDiff.DoesNotExist:
            raise NotFound("Diff not found.")
        return Response(DiffSerializer(sd).data)
