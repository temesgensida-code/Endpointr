from django.urls import path
from . import views

urlpatterns = [
    path("", views.ApiSpecListCreateView.as_view(), name="spec-list"),
    path("<uuid:pk>/", views.ApiSpecDetailView.as_view(), name="spec-detail"),
]
