"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

django_asgi_app = get_asgi_application()

import asyncio
import logging
from django.conf import settings
from channels.layers import get_channel_layer
from channels.routing import ProtocolTypeRouter, URLRouter
import AI_handler.routing
import realtime.routing

logger = logging.getLogger(__name__)
_bridge_task = None


class BridgeStarterMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        global _bridge_task
        if _bridge_task is None:
            nats_url = getattr(settings, "NATS_URL", "")
            if nats_url:
                try:
                    from realtime.bridge import run_bridge
                    channel_layer = get_channel_layer()
                    _bridge_task = asyncio.create_task(run_bridge(nats_url, channel_layer))
                    logger.info("Auto-started NATS bridge task inside Daphne ASGI process")
                except Exception as e:
                    logger.error("Failed to start embedded NATS bridge: %s", e)
        return await self.inner(scope, receive, send)


ws_patterns = AI_handler.routing.websocket_urlpatterns + realtime.routing.websocket_urlpatterns

application = BridgeStarterMiddleware(
    ProtocolTypeRouter(
        {
            'http': django_asgi_app,
            'websocket': URLRouter(ws_patterns),
        }
    )
)

