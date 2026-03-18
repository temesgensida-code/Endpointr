from django.urls import path

from .views import validate_token

urlpatterns = [
	path("validate-token/", validate_token, name="auth-validate-token"),
]
