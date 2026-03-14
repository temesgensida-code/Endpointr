import os
from functools import wraps

import jwt
from django.http import JsonResponse


class ClerkTokenValidationError(Exception):
	pass


def _build_jwks_url(issuer: str) -> str:
	base_issuer = issuer.rstrip("/")
	return f"{base_issuer}/.well-known/jwks.json"


def _get_authorization_token(request) -> str:
	auth_header = request.headers.get("Authorization", "")
	if not auth_header.startswith("Bearer "):
		raise ClerkTokenValidationError("Missing Bearer token.")

	token = auth_header[len("Bearer ") :].strip()
	if not token:
		raise ClerkTokenValidationError("Bearer token is empty.")

	return token


def validate_clerk_token(token: str):
	issuer = os.getenv("CLERK_ISSUER")
	audience = os.getenv("CLERK_AUDIENCE")
	jwks_url = os.getenv("CLERK_JWKS_URL")

	if not issuer:
		raise ClerkTokenValidationError("`CLERK_ISSUER` is not configured.")

	if not jwks_url:
		jwks_url = _build_jwks_url(issuer)

	try:
		signing_key = jwt.PyJWKClient(jwks_url).get_signing_key_from_jwt(token).key
		claims = jwt.decode(
			token,
			signing_key,
			algorithms=["RS256"],
			audience=audience if audience else None,
			issuer=issuer,
		)
	except jwt.PyJWTError as exc:
		raise ClerkTokenValidationError(f"Invalid token: {exc}") from exc

	return claims


def get_clerk_claims_from_request(request):
	token = _get_authorization_token(request)
	return validate_clerk_token(token)


def clerk_auth_required(view_func):
	@wraps(view_func)
	def _wrapped(request, *args, **kwargs):
		try:
			request.clerk_claims = get_clerk_claims_from_request(request)
		except ClerkTokenValidationError as exc:
			return JsonResponse({"ok": False, "error": str(exc)}, status=401)

		return view_func(request, *args, **kwargs)

	return _wrapped
