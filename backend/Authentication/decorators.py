from functools import wraps

import jwt
from django.conf import settings
from django.http import JsonResponse
from jwt import PyJWKClient


def _extract_bearer_token(request):
	authorization = request.headers.get("Authorization", "")
	parts = authorization.split(" ", 1)
	if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
		return None
	return parts[1].strip()


def validate_clerk_token(token):
	issuer = settings.CLERK_JWT_ISSUER
	if not issuer:
		raise ValueError("`CLERK_JWT_ISSUER` is not configured.")

	jwks_url = settings.CLERK_JWKS_URL or f"{issuer.rstrip('/')}/.well-known/jwks.json"
	jwt_audience = settings.CLERK_JWT_AUDIENCE

	jwk_client = PyJWKClient(jwks_url)
	signing_key = jwk_client.get_signing_key_from_jwt(token)

	decode_kwargs = {
		"jwt": token,
		"key": signing_key.key,
		"algorithms": ["RS256"],
		"issuer": issuer,
		"options": {"verify_aud": bool(jwt_audience)},
	}
	if jwt_audience:
		decode_kwargs["audience"] = jwt_audience

	return jwt.decode(**decode_kwargs)


def clerk_token_required(view_func):
	@wraps(view_func)
	def _wrapped(request, *args, **kwargs):
		token = _extract_bearer_token(request)
		if not token:
			return JsonResponse({"error": "Missing Bearer token."}, status=401)

		try:
			claims = validate_clerk_token(token)
		except Exception as exc:
			return JsonResponse({"error": "Invalid token.", "details": str(exc)}, status=401)

		request.clerk_claims = claims
		return view_func(request, *args, **kwargs)

	return _wrapped