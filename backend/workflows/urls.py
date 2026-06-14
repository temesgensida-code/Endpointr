from django.urls import path
from . import views

urlpatterns = [
    path("", views.WorkflowListCreateView.as_view(), name="workflow-list"),
    path("<uuid:pk>/", views.WorkflowDetailView.as_view(), name="workflow-detail"),
    path("<uuid:pk>/run/", views.WorkflowRunView.as_view(), name="workflow-run"),
    path("<uuid:pk>/runs/", views.WorkflowRunListView.as_view(), name="workflow-run-list"),
    path("<uuid:workflow_pk>/runs/<uuid:pk>/", views.WorkflowRunDetailView.as_view(), name="workflow-run-detail"),
]
