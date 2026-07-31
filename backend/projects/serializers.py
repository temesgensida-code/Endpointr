import hashlib
import os
from rest_framework import serializers
from .models import Project, ProjectMember, ApiKey


class ProjectMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectMember
        fields = ["id", "project", "clerk_user_id", "role", "joined_at"]
        read_only_fields = ["id", "joined_at"]


class ProjectSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    current_user_role = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id", "name", "description", "owner_clerk_id",
            "created_at", "updated_at", "member_count", "current_user_role",
        ]
        read_only_fields = ["id", "owner_clerk_id", "created_at", "updated_at"]

    def get_member_count(self, obj):
        return obj.members.count()

    def get_current_user_role(self, obj):
        return "owner"



class ApiKeySerializer(serializers.ModelSerializer):
    raw_key = serializers.CharField(read_only=True)

    class Meta:
        model = ApiKey
        fields = [
            "id", "project", "name", "prefix", "scopes",
            "created_by_clerk_id", "last_used_at", "expires_at",
            "active", "created_at", "raw_key",
        ]
        read_only_fields = [
            "id", "prefix", "created_by_clerk_id", "last_used_at", "created_at", "raw_key",
        ]

    def create(self, validated_data):
        raw = "enr_" + os.urandom(24).hex()
        key_hash = hashlib.sha256(raw.encode()).hexdigest()
        instance = ApiKey.objects.create(
            **validated_data,
            key_hash=key_hash,
            prefix=raw[:12],
        )
        instance.raw_key = raw
        return instance
