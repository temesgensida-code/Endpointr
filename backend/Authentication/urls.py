from django.urls import path

from .views import forgot_password, reset_password, signin, signup, validate_token

urlpatterns = [
	path("signup/", signup, name="auth-signup"),
	path("signin/", signin, name="auth-signin"),
	path("forgot-password/", forgot_password, name="auth-forgot-password"),
	path("reset-password/", reset_password, name="auth-reset-password"),
	path("validate-token/", validate_token, name="auth-validate-token"),
]
