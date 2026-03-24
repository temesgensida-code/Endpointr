from django.urls import path

from .views import rag_chat

urlpatterns = [
    path("chat/", rag_chat, name="rag-chat"),
]
