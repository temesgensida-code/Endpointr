from django.urls import path

from .views import auth_health, validate_token

urlpatterns = [
    path("health/", auth_health, name="auth-health"),
    path("validate-token/", validate_token, name="validate-token"),
]
