from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .decorators import clerk_token_required


@require_GET
@clerk_token_required
def validate_token(request):
	return JsonResponse(
		{
			"ok": True,
			"message": "Token is valid.",
			"claims": request.clerk_claims,
		}
	)
