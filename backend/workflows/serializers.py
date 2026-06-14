from rest_framework import serializers
from .models import Workflow, WorkflowRun


class WorkflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workflow
        fields = [
            "id", "project", "name", "description", "definition",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class WorkflowRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowRun
        fields = [
            "id", "workflow", "status", "started_at", "finished_at",
            "triggered_by", "result_summary", "created_at",
        ]
        read_only_fields = ["id", "status", "started_at", "finished_at", "triggered_by", "result_summary", "created_at"]
