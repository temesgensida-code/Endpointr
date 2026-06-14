from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers

from projects.permissions import IsProjectMember
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id", "project", "entity_type", "entity_id", "action",
            "diff", "actor_clerk_id", "created_at",
        ]


class AuditLogListView(APIView):
    """GET /projects/<project_pk>/audit/ — paginated audit trail."""
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        qs = AuditLog.objects.filter(project_id=project_pk)

        entity_type = request.GET.get("entity_type")
        entity_id = request.GET.get("entity_id")
        action = request.GET.get("action")
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        if entity_id:
            qs = qs.filter(entity_id=entity_id)
        if action:
            qs = qs.filter(action=action)

        limit = min(int(request.GET.get("limit", 50)), 200)
        offset = int(request.GET.get("offset", 0))
        total = qs.count()
        page = qs[offset: offset + limit]

        return Response({
            "count": total,
            "next_offset": offset + limit if offset + limit < total else None,
            "results": AuditLogSerializer(page, many=True).data,
        })
