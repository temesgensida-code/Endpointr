import json

import httpx
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from API_request.models import RequestHistory
from Authentication.decorators import authenticate_clerk_request


GEMINI_MODEL = "gemini-2.5-flash"

RAG_GUIDE_SNIPPETS = [
	{
		"topic": "FastAPI and Django endpoint debugging checklist",
		"content": (
			"When an endpoint fails, verify route path/method first, then auth, then payload shape. "
			"Check status code classes: 4xx for client mistakes, 5xx for server failures. "
			"For FastAPI, validate Pydantic model errors in response body and check dependency injection failures. "
			"For Django REST style APIs, validate serializer/input parsing, permissions, and middleware side effects."
		),
	},
	{
		"topic": "React API client troubleshooting",
		"content": (
			"In React, inspect network tab for exact request URL, method, headers, and body. "
			"Common bugs are missing Authorization header, wrong base URL, and JSON parse mismatch. "
			"Display backend error body to the user to reduce blind retries."
		),
	},
	{
		"topic": "Status code interpretation",
		"content": (
			"401 usually means missing/invalid auth token. 403 means authenticated but not authorized. "
			"404 often means wrong route or method mismatch. 422 on FastAPI means validation failed. "
			"502/504 in proxy flows usually indicate upstream connectivity or timeout problems."
		),
	},
]


def _resolve_user_id(request, payload):
	require_auth = getattr(settings, "API_PROXY_REQUIRE_AUTH", not settings.DEBUG)

	try:
		authenticate_clerk_request(request)
		return (request.clerk_claims or {}).get("sub")
	except Exception:
		if require_auth:
			raise

	client_user_id = payload.get("client_user_id")
	if client_user_id:
		return str(client_user_id).strip()
	return None


def _tokenize(text):
	return {chunk.lower() for chunk in str(text).replace("\n", " ").split() if chunk.strip()}


def _retrieve_history_context(user_id, question, limit=10, top_k=5):
	items = list(
		RequestHistory.objects.filter(clerk_user_id=user_id)
		.order_by("-created_at", "-id")[:limit]
	)

	if not items:
		return []

	q_tokens = _tokenize(question)
	scored = []
	for item in items:
		haystack = f"{item.request_method} {item.request_url} {item.response_status_code} {item.response_body[:3000]}"
		h_tokens = _tokenize(haystack)
		overlap = len(q_tokens.intersection(h_tokens))
		recency_bonus = 0.001 * item.id
		scored.append((overlap + recency_bonus, item))

	ranked = sorted(scored, key=lambda pair: pair[0], reverse=True)
	selected = [entry for score, entry in ranked[:top_k] if score > 0]
	if not selected:
		selected = items[: min(top_k, len(items))]
	return selected


def _build_rag_prompt(question, history_items):
	history_blocks = []
	for item in history_items:
		history_blocks.append(
			{
				"id": item.id,
				"method": item.request_method,
				"url": item.request_url,
				"status": item.response_status_code,
				"response_excerpt": item.response_body[:3000],
			}
		)

	prompt = {
		"assistant_role": (
			"You are an API debugging assistant. Provide concise, actionable guidance. "
			"Focus on FastAPI, Django REST API patterns, and React client integration. "
			"Ground your answer in provided request history when relevant."
		),
		"user_question": question,
		"retrieved_request_history": history_blocks,
		"debugging_knowledge": RAG_GUIDE_SNIPPETS,
		"response_requirements": [
			"Explain likely root cause with evidence from retrieved context.",
			"Give concrete next steps and endpoint-level debugging strategy.",
			"If context is insufficient, state assumptions and what to check next.",
		],
	}
	return json.dumps(prompt, ensure_ascii=False)


def _call_gemini(model, api_key, rag_prompt):
	endpoint = (
		f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
		f"?key={api_key}"
	)

	payload = {
		"contents": [
			{
				"role": "user",
				"parts": [{"text": rag_prompt}],
			}
		],
		"generationConfig": {
			"temperature": 0.3,
			"topP": 0.9,
			"maxOutputTokens": 1024,
		},
	}

	response = httpx.post(endpoint, json=payload, timeout=35)
	response.raise_for_status()
	data = response.json()

	candidates = data.get("candidates") or []
	if not candidates:
		return "I could not generate a response from the model."

	parts = (candidates[0].get("content") or {}).get("parts") or []
	text_parts = [part.get("text", "") for part in parts if isinstance(part, dict)]
	answer = "\n".join(chunk for chunk in text_parts if chunk).strip()
	return answer or "I could not generate a response from the model."


@csrf_exempt
@require_POST
def rag_chat(request):
	try:
		payload = json.loads(request.body or "{}")
	except json.JSONDecodeError:
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	question = str(payload.get("message") or "").strip()
	if not question:
		return JsonResponse({"error": "`message` is required."}, status=400)

	try:
		user_id = _resolve_user_id(request, payload)
	except Exception as exc:
		return JsonResponse({"error": "Invalid token.", "details": str(exc)}, status=401)

	if not user_id:
		return JsonResponse(
			{"error": "Could not determine sender. Include token or client_user_id."},
			status=400,
		)

	api_key = (settings.GEMINI_API_KEY or "").strip()
	model = (settings.GEMINI_MODEL or GEMINI_MODEL).strip()
	if not api_key:
		return JsonResponse(
			{
				"error": "Gemini API key is not configured.",
				"details": "Set GEMINI_API_KEY in backend environment.",
			},
			status=500,
		)

	retrieved_items = _retrieve_history_context(user_id=user_id, question=question)
	rag_prompt = _build_rag_prompt(question, retrieved_items)

	try:
		answer = _call_gemini(model=model, api_key=api_key, rag_prompt=rag_prompt)
	except httpx.HTTPStatusError as exc:
		return JsonResponse(
			{
				"error": "Gemini request failed.",
				"details": f"{exc.response.status_code}: {exc.response.text[:500]}",
			},
			status=502,
		)
	except httpx.RequestError as exc:
		return JsonResponse({"error": "Gemini connection failed.", "details": str(exc)}, status=502)

	return JsonResponse(
		{
			"answer": answer,
			"model": model,
			"retrieved_context_count": len(retrieved_items),
			"context_request_ids": [item.id for item in retrieved_items],
		},
		status=200,
	)
