from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Project, ProjectMember, ApiKey
from .serializers import ProjectSerializer, ProjectMemberSerializer, ApiKeySerializer


def _clerk_id(request):
    return "single_user"


# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        projects = Project.objects.all()
        return Response(ProjectSerializer(projects, many=True, context={"request": request}).data)

    def post(self, request):
        clerk_id = _clerk_id(request)
        ser = ProjectSerializer(data=request.data, context={"request": request})
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        with transaction.atomic():
            project = ser.save(owner_clerk_id=clerk_id)
            ProjectMember.objects.get_or_create(
                project=project, clerk_user_id=clerk_id, defaults={"role": "owner"}
            )
        return Response(ProjectSerializer(project, context={"request": request}).data, status=201)


class ProjectDetailView(APIView):
    permission_classes = [AllowAny]

    def _get(self, pk):
        try:
            return Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            raise NotFound("Project not found.")

    def get(self, request, pk):
        return Response(ProjectSerializer(self._get(pk), context={"request": request}).data)

    def patch(self, request, pk):
        project = self._get(pk)
        ser = ProjectSerializer(project, data=request.data, partial=True, context={"request": request})
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk):
        self._get(pk).delete()
        return Response(status=204)


# ── Members ───────────────────────────────────────────────────────────────────

class ProjectMemberListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, project_pk):
        members = ProjectMember.objects.filter(project_id=project_pk)
        return Response(ProjectMemberSerializer(members, many=True).data)

    def post(self, request, project_pk):
        data = {**request.data, "project": str(project_pk)}
        ser = ProjectMemberSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data, status=201)


class ProjectMemberDetailView(APIView):
    permission_classes = [AllowAny]

    def patch(self, request, project_pk, pk):
        try:
            member = ProjectMember.objects.get(pk=pk, project_id=project_pk)
        except ProjectMember.DoesNotExist:
            raise NotFound("Member not found.")
        ser = ProjectMemberSerializer(member, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data)

    def delete(self, request, project_pk, pk):
        try:
            member = ProjectMember.objects.get(pk=pk, project_id=project_pk)
        except ProjectMember.DoesNotExist:
            raise NotFound("Member not found.")
        member.delete()
        return Response(status=204)


# ── API Keys ──────────────────────────────────────────────────────────────────

class ApiKeyListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, project_pk):
        keys = ApiKey.objects.filter(project_id=project_pk)
        return Response(ApiKeySerializer(keys, many=True).data)

    def post(self, request, project_pk):
        clerk_id = _clerk_id(request)
        data = {**request.data, "project": str(project_pk)}
        ser = ApiKeySerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        instance = ser.save(created_by_clerk_id=clerk_id)
        out = ApiKeySerializer(instance).data
        out["raw_key"] = getattr(instance, "raw_key", None)
        return Response(out, status=201)


class ApiKeyDetailView(APIView):
    permission_classes = [AllowAny]

    def delete(self, request, project_pk, pk):
        try:
            ApiKey.objects.get(pk=pk, project_id=project_pk).delete()
        except ApiKey.DoesNotExist:
            raise NotFound("Key not found.")
        return Response(status=204)

