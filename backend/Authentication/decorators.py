from functools import wraps
from django.http import JsonResponse


def validate_clerk_token(token):
	return {"sub": "single_user", "email": "user@endpointr.local"}


def authenticate_clerk_request(request):
	claims = {"sub": "single_user", "email": "user@endpointr.local"}
	request.clerk_claims = claims
	return claims


def clerk_token_required(view_func):
	@wraps(view_func)
	def _wrapped(request, *args, **kwargs):
		authenticate_clerk_request(request)
		return view_func(request, *args, **kwargs)

	return _wrapped