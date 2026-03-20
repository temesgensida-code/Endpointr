import json
from urllib.parse import urlparse

import httpx
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from Authentication.decorators import authenticate_clerk_request


ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}


def _normalize_url(raw_url):
	url = str(raw_url or "").strip()
	if not url:
		return ""

	parsed = urlparse(url)
	if not parsed.scheme:
		# Default to HTTPS when user enters host/path like Postman quick input.
		url = f"https://{url}"
		parsed = urlparse(url)

	if parsed.scheme not in {"http", "https"}:
		raise ValueError("URL must use http:// or https://")

	if not parsed.netloc:
		raise ValueError("URL must include a valid host.")

	return url


@csrf_exempt
@require_POST
def send_api_request(request):
	if getattr(settings, "API_PROXY_REQUIRE_AUTH", not settings.DEBUG):
		try:
			authenticate_clerk_request(request)
		except Exception as exc:
			return JsonResponse({"error": "Invalid token.", "details": str(exc)}, status=401)

	try:
		payload = json.loads(request.body or "{}")
	except json.JSONDecodeError:
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	url = payload.get("url") or payload.get("uri")
	method = str(payload.get("method", "GET")).upper()

	if not url:
		return JsonResponse({"error": "`url` (or `uri`) is required."}, status=400)

	try:
		url = _normalize_url(url)
	except ValueError as exc:
		return JsonResponse({"error": "Invalid URL.", "details": str(exc)}, status=400)

	if method not in ALLOWED_METHODS:
		return JsonResponse(
			{
				"error": "Unsupported HTTP method.",
				"allowed_methods": sorted(ALLOWED_METHODS),
			},
			status=400,
		)

	headers = payload.get("headers") or {}
	params = payload.get("params") or {}
	request_json = payload.get("json")
	request_data = payload.get("data")
	timeout = float(payload.get("timeout", 20))

	try:
		response = httpx.request(
			method=method,
			url=url,
			headers=headers,
			params=params,
			json=request_json,
			data=request_data,
			timeout=timeout,
		)
	except httpx.InvalidURL as exc:
		return JsonResponse({"error": "Invalid URL.", "details": str(exc)}, status=400)
	except httpx.TimeoutException:
		return JsonResponse({"error": "Upstream request timed out."}, status=504)
	except httpx.ConnectError as exc:
		return JsonResponse({"error": "Could not connect to upstream host.", "details": str(exc)}, status=502)
	except httpx.RequestError as exc:
		return JsonResponse({"error": "Request failed.", "details": str(exc)}, status=502)

	try:
		response_body = response.json()
		body_is_json = True
	except ValueError:
		response_body = response.text
		body_is_json = False

	return JsonResponse(
		{
			"ok": response.is_success,
			"upstream": {
				"status_code": response.status_code,
				"method": method,
				"url": str(response.url),
				"headers": dict(response.headers),
				"is_json": body_is_json,
				"body": response_body,
			},
		},
		status=200,
	)
