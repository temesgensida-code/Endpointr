"""
AuditActorMiddleware — captures the Clerk user ID from the active HTTP request
and stores it in a thread-local so audit signals can attribute changes to the
correct actor without needing a Django User FK.
"""
from audit.signals import set_current_clerk_id


class AuditActorMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Try to extract Clerk ID early (before view processes auth)
        # We read from the Authorization header directly here — the full
        # JWT validation happens in DRF's ClerkJWTAuthentication, but we
        # just need the sub claim for audit attribution.
        clerk_id = ""
        try:
            auth = request.headers.get("Authorization", "")
            if auth.lower().startswith("bearer "):
                token = auth[7:].strip()
                if token:
                    import jwt as pyjwt
                    # Decode without verification for audit attribution only.
                    # Signature verification still happens in DRF auth.
                    claims = pyjwt.decode(token, options={"verify_signature": False})
                    clerk_id = str(claims.get("sub", ""))
        except Exception:
            pass

        set_current_clerk_id(clerk_id)
        response = self.get_response(request)
        set_current_clerk_id("")  # clean up
        return response
