from django.urls import path

from .views import delete_request_history_item, request_history, send_api_request

urlpatterns = [
    path("proxy/", send_api_request, name="send-api-request"),
    path("history/", request_history, name="request-history"),
    path("history/delete/", delete_request_history_item, name="delete-request-history-item"),
]
