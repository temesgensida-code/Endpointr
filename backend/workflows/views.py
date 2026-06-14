from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound



def _clerk_id(request):
    return getattr(request.user, 'clerk_sub', None) or getattr(request.user, 'username', None)

from projects.permissions import IsProjectMember, IsProjectEditor
from .models import Workflow, WorkflowRun
from .serializers import WorkflowSerializer, WorkflowRunSerializer
from .nats_client import publish_event


class WorkflowListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk):
        qs = Workflow.objects.filter(project_id=project_pk)
        return Response(WorkflowSerializer(qs, many=True).data)

    def post(self, request, project_pk):
        data = {**request.data, "project": str(project_pk)}
        ser = WorkflowSerializer(data=data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        instance = ser.save(created_by_clerk_id=_clerk_id(request))
        return Response(WorkflowSerializer(instance).data, status=201)


class WorkflowDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def _get(self, project_pk, pk):
        try:
            return Workflow.objects.get(pk=pk, project_id=project_pk)
        except Workflow.DoesNotExist:
            raise NotFound("Workflow not found.")

    def get(self, request, project_pk, pk):
        return Response(WorkflowSerializer(self._get(project_pk, pk)).data)

    def patch(self, request, project_pk, pk):
        wf = self._get(project_pk, pk)
        ser = WorkflowSerializer(wf, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        ser.save()
        return Response(ser.data)

    def delete(self, request, project_pk, pk):
        self._get(project_pk, pk).delete()
        return Response(status=204)


class WorkflowRunView(APIView):
    """POST /projects/<project_pk>/workflows/<pk>/run/ — dispatch to Go execution-service."""
    permission_classes = [IsAuthenticated, IsProjectEditor]

    def post(self, request, project_pk, pk):
        try:
            workflow = Workflow.objects.get(pk=pk, project_id=project_pk)
        except Workflow.DoesNotExist:
            raise NotFound("Workflow not found.")

        run = WorkflowRun.objects.create(
            workflow=workflow, status="queued", triggered_by_clerk_id=_clerk_id(request)
        )

        publish_event("runs.workflow.requested", {
            "run_id": str(run.id),
            "workflow_id": str(workflow.id),
            "definition": workflow.definition,
            "project_id": str(workflow.project_id),
        })

        return Response({"run_id": str(run.id), "status": "queued"}, status=202)


class WorkflowRunListView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk, pk):
        runs = WorkflowRun.objects.filter(workflow_id=pk, workflow__project_id=project_pk)
        return Response(WorkflowRunSerializer(runs, many=True).data)


class WorkflowRunDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get(self, request, project_pk, workflow_pk, pk):
        try:
            run = WorkflowRun.objects.get(pk=pk, workflow_id=workflow_pk, workflow__project_id=project_pk)
        except WorkflowRun.DoesNotExist:
            raise NotFound("Run not found.")
        return Response(WorkflowRunSerializer(run).data)
