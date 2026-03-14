from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .auth import ClerkTokenValidationError, get_clerk_claims_from_request


@require_GET
def auth_health(request):
	return JsonResponse({"ok": True, "service": "Authentication"})


@require_GET
def validate_token(request):
	try:
		claims = get_clerk_claims_from_request(request)
	except ClerkTokenValidationError as exc:
		return JsonResponse({"ok": False, "error": str(exc)}, status=401)

	return JsonResponse(
		{
			"ok": True,
			"token": {
				"sub": claims.get("sub"),
				"sid": claims.get("sid"),
				"iss": claims.get("iss"),
				"aud": claims.get("aud"),
				"exp": claims.get("exp"),
			},
		}
	)
