from django.urls import path

from .views import send_api_request

urlpatterns = [
    path("proxy/", send_api_request, name="send-api-request"),
]
