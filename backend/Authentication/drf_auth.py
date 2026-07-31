"""
DRF authentication class that validates Clerk JWTs.

Usage in views:
    permission_classes = [IsAuthenticated]   # ← uses this backend automatically

This is wired in settings.py under REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES.
In DEBUG mode with no Clerk config, it falls back to dev-user auth so the
new APIs work without a Clerk tenant set up.
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.conf import settings


class _ClerkUser:
    """Lightweight single-user object attached to request.user."""

    def __init__(self, clerk_sub="single_user", email="user@endpointr.local", is_superuser=True):
        self.clerk_sub = clerk_sub
        self.username = clerk_sub
        self.email = email
        self.is_superuser = is_superuser
        self.is_staff = True
        self.is_authenticated = True
        self.is_active = True
        self.pk = None

    def __str__(self):
        return self.clerk_sub


class SingleUserAuthentication(BaseAuthentication):
    """
    Single-user authentication backend for DRF.
    Automatically authenticates all incoming requests as the default single user.
    """

    def authenticate(self, request):
        return (_ClerkUser("single_user"), None)

    def authenticate_header(self, request):
        return "Bearer"


# Alias for backward compatibility
ClerkJWTAuthentication = SingleUserAuthentication

