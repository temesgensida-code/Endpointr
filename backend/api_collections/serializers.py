from rest_framework import serializers
from .models import Collection, Folder, APIRequestDefinition, Assertion, Environment


class AssertionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assertion
        fields = ["id", "type", "config", "position"]
        read_only_fields = ["id"]


class APIRequestDefinitionSerializer(serializers.ModelSerializer):
    assertions = AssertionSerializer(many=True, read_only=True)

    class Meta:
        model = APIRequestDefinition
        fields = [
            "id", "collection", "folder", "name", "method", "url",
            "headers", "body", "pre_request_script", "post_response_script",
            "position", "created_at", "updated_at", "assertions",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FolderSerializer(serializers.ModelSerializer):
    requests = APIRequestDefinitionSerializer(many=True, read_only=True)

    class Meta:
        model = Folder
        fields = ["id", "collection", "parent_folder", "name", "position", "requests"]
        read_only_fields = ["id"]


class CollectionSerializer(serializers.ModelSerializer):
    folders = FolderSerializer(many=True, read_only=True)
    request_count = serializers.SerializerMethodField()

    class Meta:
        model = Collection
        fields = [
            "id", "project", "name", "description", "tags",
            "created_by", "created_at", "updated_at", "folders", "request_count",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_request_count(self, obj):
        return obj.requests.count()


class CollectionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list endpoints (no nested folders)."""
    request_count = serializers.SerializerMethodField()

    class Meta:
        model = Collection
        fields = ["id", "project", "name", "description", "tags", "created_at", "updated_at", "request_count"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_request_count(self, obj):
        return obj.requests.count()


class EnvironmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Environment
        fields = ["id", "project", "name", "variables", "secret_variables", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"secret_variables": {"write_only": True}}
