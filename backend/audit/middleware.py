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
        clerk_id = getattr(getattr(request, "user", None), "clerk_sub", "single_user") or "single_user"
        set_current_clerk_id(clerk_id)
        response = self.get_response(request)
        set_current_clerk_id("")  # clean up
        return response

