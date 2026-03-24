from django.urls import path

from .views import request_history, send_api_request

urlpatterns = [
    path("proxy/", send_api_request, name="send-api-request"),
    path("history/", request_history, name="request-history"),
]
