from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from rest_framework import serializers



def _clerk_id(request):
    return getattr(request.user, 'clerk_sub', None) or getattr(request.user, 'username', None)

from projects.permissions import IsProjectMember, IsProjectEditor
from .models import ApiSpec


class ApiSpecSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApiSpec
        fields = ["id", "project", "version", "title", "openapi_json", "created_by", "created_at"]
        read_only_fields = ["id", "created_by", "created_at"]


class ApiSpecListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        qs = ApiSpec.objects.filter(project_id=project_pk)
        return Response(ApiSpecSerializer(qs, many=True).data)

    def post(self, request, project_pk):
        data = {**request.data, "project": str(project_pk)}
        ser = ApiSpecSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        instance = ser.save(created_by_clerk_id=_clerk_id(request))
        return Response(ApiSpecSerializer(instance).data, status=201)


class ApiSpecDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def _get(self, project_pk, pk):
        try:
            return ApiSpec.objects.get(pk=pk, project_id=project_pk)
        except ApiSpec.DoesNotExist:
            raise NotFound("Spec not found.")

    def get(self, request, project_pk, pk):
        return Response(ApiSpecSerializer(self._get(project_pk, pk)).data)

    def delete(self, request, project_pk, pk):
        self._get(project_pk, pk).delete()
        return Response(status=204)
