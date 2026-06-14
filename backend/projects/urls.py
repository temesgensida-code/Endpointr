from django.urls import path
from . import views

urlpatterns = [
    path("", views.ProjectListCreateView.as_view(), name="project-list"),
    path("<uuid:pk>/", views.ProjectDetailView.as_view(), name="project-detail"),
    path("<uuid:project_pk>/members/", views.ProjectMemberListView.as_view(), name="project-members"),
    path("<uuid:project_pk>/members/<int:pk>/", views.ProjectMemberDetailView.as_view(), name="project-member-detail"),
    path("<uuid:project_pk>/api-keys/", views.ApiKeyListCreateView.as_view(), name="api-keys"),
    path("<uuid:project_pk>/api-keys/<uuid:pk>/", views.ApiKeyDetailView.as_view(), name="api-key-detail"),
]
