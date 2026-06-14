from django.urls import path
from . import views

urlpatterns = [
    path("jwt/analyze/", views.JWTAnalyzeView.as_view(), name="jwt-analyze"),
]
