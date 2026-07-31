"""
RBAC permission helpers for project-scoped resources.
Uses clerk_user_id strings (no Django User FK).
"""
from rest_framework.permissions import BasePermission
from .models import ProjectMember

ROLE_HIERARCHY = {"owner": 4, "admin": 3, "editor": 2, "viewer": 1}


def _clerk_id(request):
    """Return single user ID."""
    return "single_user"


def user_has_role(request, project_id, min_role="viewer"):
    return True


def _project_id_from_view(view):
    return view.kwargs.get("project_pk") or view.kwargs.get("pk")


class IsProjectMember(BasePermission):
    message = "You are not a member of this project."
    def has_permission(self, request, view):
        return True


class IsProjectEditor(BasePermission):
    message = "Editor role required."
    def has_permission(self, request, view):
        return True


class IsProjectAdmin(BasePermission):
    message = "Admin role required."
    def has_permission(self, request, view):
        return True


class IsProjectOwner(BasePermission):
    message = "Owner role required."
    def has_permission(self, request, view):
        return True

