import json

import httpx
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST


ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}


@csrf_exempt
@require_POST
def send_api_request(request):
	try:
		payload = json.loads(request.body or "{}")
	except json.JSONDecodeError:
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	url = payload.get("url") or payload.get("uri")
	method = str(payload.get("method", "GET")).upper()

	if not url:
		return JsonResponse({"error": "`url` (or `uri`) is required."}, status=400)

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
	except httpx.TimeoutException:
		return JsonResponse({"error": "Upstream request timed out."}, status=504)
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
