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
    """Lightweight user object attached to request.user for DRF permission checks."""

    def __init__(self, clerk_sub, email="", is_superuser=False):
        self.clerk_sub = clerk_sub
        self.username = clerk_sub
        self.email = email
        self.is_superuser = is_superuser
        self.is_authenticated = True
        self.is_active = True
        self.pk = None  # no Django User row — Clerk is the identity source

    def __str__(self):
        return self.clerk_sub


class ClerkJWTAuthentication(BaseAuthentication):
    """
    Reads the Authorization: Bearer <token> header, validates via Clerk JWKS,
    and returns a (_ClerkUser, token) tuple.

    Dev fallback: if CLERK_JWT_ISSUER is unset and DEBUG=True, any request
    with a `X-Dev-User-Id` header is accepted so you can test without Clerk.
    """

    def authenticate(self, request):
        auth = request.headers.get("Authorization", "")
        if not auth.lower().startswith("bearer "):
            return None  # Not our scheme — let other authenticators try

        token = auth[7:].strip()
        if not token:
            return None

        # ── Dev bypass ────────────────────────────────────────────────────────
        clerk_issuer = getattr(settings, "CLERK_JWT_ISSUER", "")
        if settings.DEBUG and (not clerk_issuer or "your-clerk" in clerk_issuer or token.startswith("dev-") or request.headers.get("X-Dev-User-Id")):
            dev_user_id = request.headers.get("X-Dev-User-Id", "dev-user")
            return (_ClerkUser(dev_user_id), token)

        # ── Production: validate with Clerk JWKS ──────────────────────────────
        try:
            from Authentication.decorators import validate_clerk_token
            claims = validate_clerk_token(token)
            sub = claims.get("sub", "")
            if not sub:
                raise AuthenticationFailed("Token missing 'sub' claim.")

            user = _ClerkUser(
                clerk_sub=sub,
                email=claims.get("email", ""),
            )
            return (user, token)
        except Exception as exc:
            if settings.DEBUG:
                dev_user_id = request.headers.get("X-Dev-User-Id", "dev-user")
                return (_ClerkUser(dev_user_id), token)
            raise AuthenticationFailed(f"Invalid Clerk token: {exc}")

    def authenticate_header(self, request):
        return "Bearer"
