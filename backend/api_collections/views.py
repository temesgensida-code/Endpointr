import copy
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound



def _clerk_id(request):
    return getattr(request.user, 'clerk_sub', None) or getattr(request.user, 'username', None)

from projects.permissions import IsProjectMember, IsProjectEditor
from .models import Collection, Folder, APIRequestDefinition, Assertion, Environment
from .serializers import (
    CollectionSerializer, CollectionListSerializer,
    FolderSerializer, APIRequestDefinitionSerializer,
    AssertionSerializer, EnvironmentSerializer,
)


# ── Collections ───────────────────────────────────────────────────────────────

class CollectionListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        qs = Collection.objects.filter(project_id=project_pk)
        return Response(CollectionListSerializer(qs, many=True).data)

    def post(self, request, project_pk):
        self.permission_classes = [IsAuthenticated, IsProjectEditor]
        self.check_permissions(request)
        data = {**request.data, "project": str(project_pk)}
        ser = CollectionSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        instance = ser.save(created_by_clerk_id=_clerk_id(request))
        return Response(CollectionSerializer(instance).data, status=201)


class CollectionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def _get(self, pk, project_pk):
        try:
            return Collection.objects.get(pk=pk, project_id=project_pk)
        except Collection.DoesNotExist:
            raise NotFound("Collection not found.")

    def get(self, request, project_pk, pk):
        col = self._get(pk, project_pk)
        return Response(CollectionSerializer(col).data)

    def patch(self, request, project_pk, pk):
        col = self._get(pk, project_pk)
        ser = CollectionSerializer(col, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data)

    def delete(self, request, project_pk, pk):
        col = self._get(pk, project_pk)
        col.delete()
        return Response(status=204)


class CollectionCloneView(APIView):
    """POST /projects/<project_pk>/collections/<pk>/clone/"""
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def post(self, request, project_pk, pk):
        try:
            original = Collection.objects.prefetch_related(
                "folders", "requests", "requests__assertions"
            ).get(pk=pk, project_id=project_pk)
        except Collection.DoesNotExist:
            raise NotFound("Collection not found.")

        new_col = Collection.objects.create(
            project_id=project_pk,
            name=f"{original.name} (copy)",
            description=original.description,
            tags=copy.deepcopy(original.tags),
            created_by=request.user,
        )

        # Clone folders (preserve parent hierarchy with a map)
        folder_map = {}
        for folder in original.folders.filter(parent_folder__isnull=True).order_by("position"):
            new_f = Folder.objects.create(collection=new_col, name=folder.name, position=folder.position)
            folder_map[str(folder.id)] = new_f

        # Clone requests
        for req in original.requests.all():
            new_folder = folder_map.get(str(req.folder_id)) if req.folder_id else None
            new_req = APIRequestDefinition.objects.create(
                collection=new_col, folder=new_folder,
                name=req.name, method=req.method, url=req.url,
                headers=copy.deepcopy(req.headers), body=copy.deepcopy(req.body),
                position=req.position,
            )
            for assertion in req.assertions.all():
                Assertion.objects.create(
                    request=new_req, type=assertion.type,
                    config=copy.deepcopy(assertion.config), position=assertion.position,
                )

        return Response(CollectionSerializer(new_col).data, status=201)


# ── Folders ───────────────────────────────────────────────────────────────────

class FolderListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk, collection_pk):
        qs = Folder.objects.filter(collection_id=collection_pk, collection__project_id=project_pk)
        return Response(FolderSerializer(qs, many=True).data)

    def post(self, request, project_pk, collection_pk):
        data = {**request.data, "collection": str(collection_pk)}
        ser = FolderSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data, status=201)


class FolderDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def patch(self, request, project_pk, collection_pk, pk):
        try:
            folder = Folder.objects.get(pk=pk, collection_id=collection_pk)
        except Folder.DoesNotExist:
            raise NotFound("Folder not found.")
        ser = FolderSerializer(folder, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data)

    def delete(self, request, project_pk, collection_pk, pk):
        try:
            folder = Folder.objects.get(pk=pk, collection_id=collection_pk)
        except Folder.DoesNotExist:
            raise NotFound("Folder not found.")
        folder.delete()
        return Response(status=204)


# ── Requests ──────────────────────────────────────────────────────────────────

class RequestListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk, collection_pk):
        qs = APIRequestDefinition.objects.filter(
            collection_id=collection_pk, collection__project_id=project_pk
        )
        return Response(APIRequestDefinitionSerializer(qs, many=True).data)

    def post(self, request, project_pk, collection_pk):
        data = {**request.data, "collection": str(collection_pk)}
        ser = APIRequestDefinitionSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data, status=201)


class RequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def _get(self, collection_pk, pk):
        try:
            return APIRequestDefinition.objects.get(pk=pk, collection_id=collection_pk)
        except APIRequestDefinition.DoesNotExist:
            raise NotFound("Request not found.")

    def get(self, request, project_pk, collection_pk, pk):
        req = self._get(collection_pk, pk)
        return Response(APIRequestDefinitionSerializer(req).data)

    def patch(self, request, project_pk, collection_pk, pk):
        req = self._get(collection_pk, pk)
        ser = APIRequestDefinitionSerializer(req, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data)

    def delete(self, request, project_pk, collection_pk, pk):
        req = self._get(collection_pk, pk)
        req.delete()
        return Response(status=204)


# ── Assertions ────────────────────────────────────────────────────────────────

class AssertionListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def get(self, request, project_pk, collection_pk, request_pk):
        qs = Assertion.objects.filter(request_id=request_pk)
        return Response(AssertionSerializer(qs, many=True).data)

    def post(self, request, project_pk, collection_pk, request_pk):
        data = {**request.data, "request": str(request_pk)}
        ser = AssertionSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data, status=201)


# ── Environments ──────────────────────────────────────────────────────────────

class EnvironmentListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        qs = Environment.objects.filter(project_id=project_pk)
        return Response(EnvironmentSerializer(qs, many=True).data)

    def post(self, request, project_pk):
        data = {**request.data, "project": str(project_pk)}
        ser = EnvironmentSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data, status=201)


class EnvironmentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def _get(self, project_pk, pk):
        try:
            return Environment.objects.get(pk=pk, project_id=project_pk)
        except Environment.DoesNotExist:
            raise NotFound("Environment not found.")

    def get(self, request, project_pk, pk):
        return Response(EnvironmentSerializer(self._get(project_pk, pk)).data)

    def patch(self, request, project_pk, pk):
        env = self._get(project_pk, pk)
        ser = EnvironmentSerializer(env, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data)

    def delete(self, request, project_pk, pk):
        self._get(project_pk, pk).delete()
        return Response(status=204)
