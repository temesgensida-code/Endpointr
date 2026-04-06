import json
from urllib.parse import urlparse
import httpx
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from Authentication.decorators import authenticate_clerk_request
from API_request.models import RequestHistory


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


def _resolve_user_id(request, payload=None):
	payload = payload or {}
	require_auth = getattr(settings, "API_PROXY_REQUIRE_AUTH", not settings.DEBUG)

	try:
		authenticate_clerk_request(request)
		return (request.clerk_claims or {}).get("sub")
	except Exception:
		if require_auth:
			raise

	# Dev fallback: when Clerk verification is disabled, allow client user id.
	client_user_id = payload.get("client_user_id") or request.GET.get("client_user_id")
	return str(client_user_id).strip() if client_user_id else None


def _serialize_response_body(body):
	if isinstance(body, (dict, list)):
		return json.dumps(body, ensure_ascii=False)
	return str(body)


def _store_request_history(user_id, method, url, response_status_code, response_body):
	if not user_id:
		return

	RequestHistory.objects.create(
		clerk_user_id=user_id,
		request_method=method,
		request_url=url,
		response_status_code=response_status_code,
		response_body=_serialize_response_body(response_body),
	)

	old_entries = RequestHistory.objects.filter(clerk_user_id=user_id).order_by("-created_at", "-id")[10:]
	old_ids = list(old_entries.values_list("id", flat=True))
	if old_ids:
		RequestHistory.objects.filter(id__in=old_ids).delete()


@csrf_exempt
@require_GET
def request_history(request):
	try:
		user_id = _resolve_user_id(request)
	except Exception as exc:
		return JsonResponse({"error": "Invalid token.", "details": str(exc)}, status=401)

	if not user_id:
		return JsonResponse(
			{"error": "Could not determine request sender. Include token or client_user_id."},
			status=400,
		)

	history_items = RequestHistory.objects.filter(clerk_user_id=user_id).order_by("-created_at", "-id")[:10]

	serialized = []
	for item in history_items:
		try:
			response_body = json.loads(item.response_body)
		except json.JSONDecodeError:
			response_body = item.response_body

		serialized.append(
			{
				"id": item.id,
				"requested_url": item.request_url,
				"method": item.request_method,
				"response_status_code": item.response_status_code,
				"response": response_body,
				"created_at": item.created_at.isoformat(),
			}
		)

	return JsonResponse({"history": serialized}, status=200)


@csrf_exempt
@require_POST
def delete_request_history_item(request):
	try:
		payload = json.loads(request.body or "{}")
	except json.JSONDecodeError:
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	try:
		user_id = _resolve_user_id(request, payload)
	except Exception as exc:
		return JsonResponse({"error": "Invalid token.", "details": str(exc)}, status=401)

	if not user_id:
		return JsonResponse(
			{"error": "Could not determine request sender. Include token or client_user_id."},
			status=400,
		)

	item_id = payload.get("history_id")
	if not item_id:
		return JsonResponse({"error": "`history_id` is required."}, status=400)

	deleted_count, _ = RequestHistory.objects.filter(
		id=item_id,
		clerk_user_id=user_id,
	).delete()

	if deleted_count == 0:
		return JsonResponse({"error": "History item not found."}, status=404)

	return JsonResponse({"ok": True, "deleted_history_id": item_id}, status=200)


@csrf_exempt
@require_POST
def send_api_request(request):
	try:
		payload = json.loads(request.body or "{}")
	except json.JSONDecodeError:
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	try:
		user_id = _resolve_user_id(request, payload)
	except Exception as exc:
		return JsonResponse({"error": "Invalid token.", "details": str(exc)}, status=401)

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
		_store_request_history(user_id, method, str(url), 400, {"error": "Invalid URL.", "details": str(exc)})
		return JsonResponse({"error": "Invalid URL.", "details": str(exc)}, status=400)
	except httpx.TimeoutException:
		_store_request_history(user_id, method, str(url), 504, {"error": "Upstream request timed out."})
		return JsonResponse({"error": "Upstream request timed out."}, status=504)
	except httpx.ConnectError as exc:
		_store_request_history(
			user_id,
			method,
			str(url),
			502,
			{"error": "Could not connect to upstream host.", "details": str(exc)},
		)
		return JsonResponse({"error": "Could not connect to upstream host.", "details": str(exc)}, status=502)
	except httpx.RequestError as exc:
		_store_request_history(user_id, method, str(url), 502, {"error": "Request failed.", "details": str(exc)})
		return JsonResponse({"error": "Request failed.", "details": str(exc)}, status=502)

	try:
		response_body = response.json()
		body_is_json = True
	except ValueError:
		response_body = response.text
		body_is_json = False

	response_payload = {
		"ok": response.is_success,
		"upstream": {
			"status_code": response.status_code,
			"method": method,
			"url": str(response.url),
			"headers": dict(response.headers),
			"is_json": body_is_json,
			"body": response_body,
		},
	}

	_store_request_history(user_id, method, str(response.url), response.status_code, response_payload["upstream"])

	return JsonResponse(response_payload, status=200)
