import re
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from AI_handler.models import ChatTurn
from AI_handler.views import (
    DEFAULT_MEMORY_TURNS,
    GEMINI_EMBEDDING_MODEL,
    GEMINI_MODEL,
    _build_rag_prompt,
    _load_chat_memory,
    _normalize_ai_content,
    _retrieve_history_context,
    _system_instruction,
)
from Authentication.decorators import validate_clerk_token


def _chunk_to_text(content):
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get('text', '')))
            else:
                parts.append(str(item))
        return ''.join(parts)

    return str(content or '')


def _word_tokens(text):
    return re.findall(r'\S+\s*', text)


def _save_chat_turns(user_id, conversation_id, question, answer):
    ChatTurn.objects.create(
        clerk_user_id=user_id,
        conversation_id=conversation_id,
        role='user',
        content=question,
    )
    ChatTurn.objects.create(
        clerk_user_id=user_id,
        conversation_id=conversation_id,
        role='assistant',
        content=answer,
    )


class AiChatStreamConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        query = parse_qs(query_string)

        token = (query.get('token', [''])[0] or '').strip()
        client_user_id = (query.get('client_user_id', [''])[0] or '').strip()

        self.require_auth = getattr(settings, 'API_PROXY_REQUIRE_AUTH', not settings.DEBUG)
        self.user_id = None

        if token:
            try:
                claims = await sync_to_async(validate_clerk_token)(token)
                self.user_id = str(claims.get('sub') or '').strip() or None
            except Exception:
                # In local/dev mode auth may be optional; mirror HTTP fallback behavior.
                if self.require_auth:
                    await self.close(code=4401)
                    return

        if not self.user_id and client_user_id:
            self.user_id = client_user_id

        if self.require_auth and not self.user_id:
            await self.close(code=4401)
            return

        await self.accept()

    async def receive_json(self, content, **kwargs):
        question = str(content.get('message') or '').strip()
        conversation_id = str(content.get('conversation_id') or 'default').strip() or 'default'

        if not question:
            await self.send_json({'type': 'assistant_error', 'error': '`message` is required.'})
            await self.close(code=4400)
            return

        user_id = self.user_id or str(content.get('client_user_id') or '').strip()
        if not user_id:
            await self.send_json(
                {
                    'type': 'assistant_error',
                    'error': 'Could not determine sender. Include token or client_user_id.',
                }
            )
            await self.close(code=4400)
            return

        api_key = (settings.GEMINI_API_KEY or '').strip()
        model = (settings.GEMINI_MODEL or GEMINI_MODEL).strip()
        embedding_model = (settings.GEMINI_EMBEDDING_MODEL or GEMINI_EMBEDDING_MODEL).strip()
        memory_turns = int(getattr(settings, 'CHAT_MEMORY_TURNS', DEFAULT_MEMORY_TURNS))

        if not api_key:
            await self.send_json(
                {
                    'type': 'assistant_error',
                    'error': 'Gemini API key is not configured.',
                    'details': 'Set GEMINI_API_KEY in backend environment.',
                }
            )
            await self.close(code=1011)
            return

        try:
            retrieved_items = await sync_to_async(_retrieve_history_context)(
                user_id=user_id,
                question=question,
                api_key=api_key,
                embedding_model=embedding_model,
            )
            rag_prompt = await sync_to_async(_build_rag_prompt)(question, retrieved_items)
            memory_messages = await sync_to_async(_load_chat_memory)(
                user_id=user_id,
                conversation_id=conversation_id,
                memory_turns=memory_turns,
            )

            messages = [SystemMessage(content=_system_instruction(rag_prompt))]
            messages.extend(memory_messages)
            messages.append(HumanMessage(content=question))

            chat_model = ChatGoogleGenerativeAI(
                model=model,
                google_api_key=api_key,
                temperature=0.3,
            )

            answer_parts = []
            async for chunk in chat_model.astream(messages):
                chunk_text = _chunk_to_text(chunk.content)
                if not chunk_text:
                    continue

                for token in _word_tokens(chunk_text):
                    answer_parts.append(token)
                    await self.send_json({'type': 'assistant_chunk', 'delta': token})

            answer = _normalize_ai_content(''.join(answer_parts))
            await sync_to_async(_save_chat_turns)(user_id, conversation_id, question, answer)

            await self.send_json(
                {
                    'type': 'assistant_complete',
                    'answer': answer,
                    'model': model,
                    'embedding_model': embedding_model,
                    'retrieval_mode': 'gemini-embeddings',
                    'conversation_id': conversation_id,
                    'memory_turns_used': len(memory_messages),
                    'retrieved_context_count': len(retrieved_items),
                    'context_request_ids': [item.id for item in retrieved_items],
                }
            )
        except Exception as exc:
            await self.send_json(
                {
                    'type': 'assistant_error',
                    'error': 'Gemini request failed.',
                    'details': str(exc),
                }
            )
        finally:
            await self.close()
