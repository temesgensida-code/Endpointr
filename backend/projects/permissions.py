"""
RBAC permission helpers for project-scoped resources.
Uses clerk_user_id strings (no Django User FK).
"""
from rest_framework.permissions import BasePermission
from .models import ProjectMember

ROLE_HIERARCHY = {"owner": 4, "admin": 3, "editor": 2, "viewer": 1}


def _clerk_id(request):
    """Extract Clerk user ID from the DRF-authenticated user object."""
    user = getattr(request, "user", None)
    if user is None:
        return None
    # ClerkJWTAuthentication sets user.clerk_sub
    return getattr(user, "clerk_sub", None) or getattr(user, "username", None)


def user_has_role(request, project_id, min_role="viewer"):
    clerk_id = _clerk_id(request)
    if not clerk_id:
        return False
    # Superuser bypass (only for Django admin users, rare)
    if getattr(request.user, "is_superuser", False):
        return True
    from .models import Project
    if Project.objects.filter(id=project_id, owner_clerk_id=clerk_id).exists():
        return True
    try:
        member = ProjectMember.objects.get(project_id=project_id, clerk_user_id=clerk_id)
        return ROLE_HIERARCHY.get(member.role, 0) >= ROLE_HIERARCHY.get(min_role, 0)
    except ProjectMember.DoesNotExist:
        return False


def _project_id_from_view(view):
    return view.kwargs.get("project_pk") or view.kwargs.get("pk")


class IsProjectMember(BasePermission):
    message = "You are not a member of this project."
    def has_permission(self, request, view):
        return user_has_role(request, _project_id_from_view(view), "viewer")


class IsProjectEditor(BasePermission):
    message = "Editor role required."
    def has_permission(self, request, view):
        return user_has_role(request, _project_id_from_view(view), "editor")


class IsProjectAdmin(BasePermission):
    message = "Admin role required."
    def has_permission(self, request, view):
        return user_has_role(request, _project_id_from_view(view), "admin")


class IsProjectOwner(BasePermission):
    message = "Owner role required."
    def has_permission(self, request, view):
        return user_has_role(request, _project_id_from_view(view), "owner")
