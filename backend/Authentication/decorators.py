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


_JWK_CLIENTS = {}


def _get_jwk_client(jwks_url: str) -> PyJWKClient:
	"""Retrieve or initialize a cached PyJWKClient instance for the given JWKS URL."""
	if jwks_url not in _JWK_CLIENTS:
		_JWK_CLIENTS[jwks_url] = PyJWKClient(
			jwks_url,
			cache_keys=True,
			max_cached_keys=16,
			cache_jwk_set=True,
			lifespan=300,
		)
	return _JWK_CLIENTS[jwks_url]


def validate_clerk_token(token):
	issuer = settings.CLERK_JWT_ISSUER
	if not issuer:
		raise ValueError("`CLERK_JWT_ISSUER` is not configured.")

	jwks_url = settings.CLERK_JWKS_URL or f"{issuer.rstrip('/')}/.well-known/jwks.json"
	jwt_audience = settings.CLERK_JWT_AUDIENCE

	jwk_client = _get_jwk_client(jwks_url)
	signing_key = jwk_client.get_signing_key_from_jwt(token)

	decode_kwargs = {
		"jwt": token,
		"key": signing_key.key,
		"algorithms": ["RS256", "RS384", "RS512"],
		"issuer": issuer,
		"leeway": 10,  # 10s leeway for clock skew
		"options": {
			"verify_aud": bool(jwt_audience),
			"verify_signature": True,
			"verify_exp": True,
			"verify_nbf": True,
			"verify_iat": True,
		},
	}
	if jwt_audience:
		decode_kwargs["audience"] = jwt_audience

	return jwt.decode(**decode_kwargs)


def authenticate_clerk_request(request):
	token = _extract_bearer_token(request)
	if not token:
		raise ValueError("Missing Bearer token.")

	claims = validate_clerk_token(token)
	request.clerk_claims = claims
	return claims


def clerk_token_required(view_func):
	@wraps(view_func)
	def _wrapped(request, *args, **kwargs):
		try:
			authenticate_clerk_request(request)
		except Exception as exc:
			return JsonResponse({"error": "Invalid token.", "details": str(exc)}, status=401)

		return view_func(request, *args, **kwargs)

	return _wrapped