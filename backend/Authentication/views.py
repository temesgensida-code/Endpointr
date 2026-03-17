import json

import httpx
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .decorators import clerk_token_required


def _parse_json_body(request):
	try:
		return json.loads(request.body or "{}"), None
	except json.JSONDecodeError:
		return None, JsonResponse({"error": "Invalid JSON payload."}, status=400)


def _clerk_headers():
	secret_key = settings.CLERK_SECRET_KEY
	if not secret_key:
		return None
	return {
		"Authorization": f"Bearer {secret_key}",
		"Content-Type": "application/json",
	}


def _clerk_request(method, path, payload=None):
	headers = _clerk_headers()
	if headers is None:
		return 500, {"error": "`CLERK_SECRET_KEY` is not configured."}

	url = f"{settings.CLERK_API_BASE_URL.rstrip('/')}{path}"
	try:
		response = httpx.request(method=method, url=url, headers=headers, json=payload, timeout=20.0)
	except httpx.TimeoutException:
		return 504, {"error": "Clerk request timed out."}
	except httpx.RequestError as exc:
		return 502, {"error": "Failed to reach Clerk.", "details": str(exc)}

	try:
		response_body = response.json()
	except ValueError:
		response_body = {"raw": response.text}

	return response.status_code, response_body


@csrf_exempt
@require_POST
def signup(request):
	payload, error = _parse_json_body(request)
	if error:
		return error

	email = payload.get("email")
	password = payload.get("password")
	first_name = payload.get("first_name")
	last_name = payload.get("last_name")

	if not email or not password:
		return JsonResponse({"error": "`email` and `password` are required."}, status=400)

	status_code, response_body = _clerk_request(
		"POST",
		"/v1/users",
		{
			"email_address": [email],
			"password": password,
			"first_name": first_name,
			"last_name": last_name,
		},
	)

	return JsonResponse({"clerk": response_body}, status=status_code)


@csrf_exempt
@require_POST
def signin(request):
	payload, error = _parse_json_body(request)
	if error:
		return error

	identifier = payload.get("identifier") or payload.get("email")
	password = payload.get("password")

	if not identifier or not password:
		return JsonResponse({"error": "`identifier` (or `email`) and `password` are required."}, status=400)

	status_code, response_body = _clerk_request(
		"POST",
		"/v1/sign_ins",
		{
			"strategy": "password",
			"identifier": identifier,
			"password": password,
		},
	)

	return JsonResponse({"clerk": response_body}, status=status_code)


@csrf_exempt
@require_POST
def forgot_password(request):
	payload, error = _parse_json_body(request)
	if error:
		return error

	email = payload.get("email")
	if not email:
		return JsonResponse({"error": "`email` is required."}, status=400)

	status_code, response_body = _clerk_request(
		"POST",
		"/v1/sign_ins",
		{
			"strategy": "reset_password_email_code",
			"identifier": email,
		},
	)

	return JsonResponse({"clerk": response_body}, status=status_code)


@csrf_exempt
@require_POST
def reset_password(request):
	payload, error = _parse_json_body(request)
	if error:
		return error

	sign_in_id = payload.get("sign_in_id")
	code = payload.get("code")
	new_password = payload.get("new_password")

	if not sign_in_id or not code or not new_password:
		return JsonResponse(
			{"error": "`sign_in_id`, `code`, and `new_password` are required."},
			status=400,
		)

	status_code, response_body = _clerk_request(
		"POST",
		f"/v1/sign_ins/{sign_in_id}/attempt_first_factor",
		{
			"strategy": "reset_password_email_code",
			"code": code,
			"password": new_password,
		},
	)

	return JsonResponse({"clerk": response_body}, status=status_code)


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
