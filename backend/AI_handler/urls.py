from django.urls import path

from .views import rag_chat, recent_chat_history

urlpatterns = [
    path("chat/", rag_chat, name="rag-chat"),
    path("history/", recent_chat_history, name="recent-chat-history"),
]
