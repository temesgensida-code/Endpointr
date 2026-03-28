import json

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from AI_handler.models import ChatTurn
from API_request.models import RequestHistory
from Authentication.decorators import authenticate_clerk_request


GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_MEMORY_TURNS = 12

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


def _system_instruction(rag_prompt):
	return (
		"You are an API debugging assistant focused on FastAPI, Django REST API patterns, and React clients. "
		"Use the retrieved context and prior turns to answer. If unsure, state assumptions clearly. "
		"Retrieved RAG context (JSON):\n"
		f"{rag_prompt}"
	)


def _load_chat_memory(user_id, conversation_id, memory_turns):
	recent_turns = list(
		ChatTurn.objects.filter(clerk_user_id=user_id, conversation_id=conversation_id)
		.order_by("-created_at", "-id")[:memory_turns]
	)
	recent_turns.reverse()

	messages = []
	for turn in recent_turns:
		if turn.role == "user":
			messages.append(HumanMessage(content=turn.content))
		elif turn.role == "assistant":
			messages.append(AIMessage(content=turn.content))
	return messages


def _normalize_ai_content(content):
	if isinstance(content, str):
		return content.strip() or "I could not generate a response from the model."

	if isinstance(content, list):
		parts = []
		for item in content:
			if isinstance(item, dict):
				parts.append(str(item.get("text", "")))
			else:
				parts.append(str(item))
		text = "\n".join(chunk for chunk in parts if chunk).strip()
		return text or "I could not generate a response from the model."

	return str(content or "I could not generate a response from the model.")


@csrf_exempt
@require_POST
def rag_chat(request):
	try:
		payload = json.loads(request.body or "{}")
	except json.JSONDecodeError:
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	question = str(payload.get("message") or "").strip()
	conversation_id = str(payload.get("conversation_id") or "default").strip() or "default"
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
	memory_turns = int(getattr(settings, "CHAT_MEMORY_TURNS", DEFAULT_MEMORY_TURNS))
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
	memory_messages = _load_chat_memory(user_id=user_id, conversation_id=conversation_id, memory_turns=memory_turns)

	messages = [SystemMessage(content=_system_instruction(rag_prompt))]
	messages.extend(memory_messages)
	messages.append(HumanMessage(content=question))

	chat_model = ChatGoogleGenerativeAI(
		model=model,
		google_api_key=api_key,
		temperature=0.3,
	)

	try:
		ai_response = chat_model.invoke(messages)
		answer = _normalize_ai_content(ai_response.content)
	except Exception as exc:
		return JsonResponse(
			{
				"error": "Gemini request failed.",
				"details": str(exc),
			},
			status=502,
		)

	ChatTurn.objects.create(
		clerk_user_id=user_id,
		conversation_id=conversation_id,
		role="user",
		content=question,
	)
	ChatTurn.objects.create(
		clerk_user_id=user_id,
		conversation_id=conversation_id,
		role="assistant",
		content=answer,
	)

	return JsonResponse(
		{
			"answer": answer,
			"model": model,
			"conversation_id": conversation_id,
			"memory_turns_used": len(memory_messages),
			"retrieved_context_count": len(retrieved_items),
			"context_request_ids": [item.id for item in retrieved_items],
		},
		status=200,
	)

@csrf_exempt
@require_POST
def recent_chat_history(request):
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
			{"error": "Could not determine sender. Include token or client_user_id."},
			status=400,
		)

	action = payload.get("action", "list_conversations")
	conversation_id = str(payload.get("conversation_id") or "").strip()
	
	try:
		if action == "get_conversation" and conversation_id:
			turns = ChatTurn.objects.filter(
				clerk_user_id=user_id,
				conversation_id=conversation_id
			).order_by("created_at")
			
			history = []
			for turn in turns:
				history.append({
					"role": turn.role,
					"content": turn.content,
					"created_at": turn.created_at.isoformat()
				})
			return JsonResponse({"history": history}, status=200)

		else:
			recent_turns = ChatTurn.objects.filter(
				clerk_user_id=user_id, 
				role="user"
			).order_by("-created_at")[:50]
			
			conversations = []
			seen = set()
			for turn in recent_turns:
				if turn.conversation_id not in seen:
					seen.add(turn.conversation_id)
					conversations.append({
						"conversation_id": turn.conversation_id,
						"id": turn.id,
						"content": turn.content,
						"created_at": turn.created_at.isoformat()
					})
					if len(conversations) >= 10:
						break
				
			return JsonResponse({"history": conversations}, status=200)
	except Exception as exc:
		return JsonResponse({"error": "Could not fetch history.", "details": str(exc)}, status=500)

