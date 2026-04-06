from django.urls import re_path

from .consumers import AiChatStreamConsumer

websocket_urlpatterns = [
    re_path(r'^ws/ai/chat/$', AiChatStreamConsumer.as_asgi()),
]
