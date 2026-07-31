from rest_framework import serializers
from .models import Workflow, WorkflowRun


class WorkflowSerializer(serializers.ModelSerializer):
    created_by = serializers.CharField(source="created_by_clerk_id", read_only=True)

    class Meta:
        model = Workflow
        fields = [
            "id", "project", "name", "description", "definition",
            "created_by", "created_by_clerk_id", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_by_clerk_id", "created_at", "updated_at"]


class WorkflowRunSerializer(serializers.ModelSerializer):
    triggered_by = serializers.CharField(source="triggered_by_clerk_id", read_only=True)

    class Meta:
        model = WorkflowRun
        fields = [
            "id", "workflow", "status", "started_at", "finished_at",
            "triggered_by", "triggered_by_clerk_id", "result_summary", "created_at",
        ]
        read_only_fields = ["id", "status", "started_at", "finished_at", "triggered_by", "triggered_by_clerk_id", "result_summary", "created_at"]

