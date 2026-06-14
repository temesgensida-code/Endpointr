from django.urls import path
from . import views

urlpatterns = [
    # Collections
    path("", views.CollectionListCreateView.as_view(), name="collection-list"),
    path("<uuid:pk>/", views.CollectionDetailView.as_view(), name="collection-detail"),
    path("<uuid:pk>/clone/", views.CollectionCloneView.as_view(), name="collection-clone"),
    # Folders
    path("<uuid:collection_pk>/folders/", views.FolderListCreateView.as_view(), name="folder-list"),
    path("<uuid:collection_pk>/folders/<uuid:pk>/", views.FolderDetailView.as_view(), name="folder-detail"),
    # Requests
    path("<uuid:collection_pk>/requests/", views.RequestListCreateView.as_view(), name="request-list"),
    path("<uuid:collection_pk>/requests/<uuid:pk>/", views.RequestDetailView.as_view(), name="request-detail"),
    # Assertions
    path(
        "<uuid:collection_pk>/requests/<uuid:request_pk>/assertions/",
        views.AssertionListCreateView.as_view(), name="assertion-list",
    ),
    # Environments
    path("environments/", views.EnvironmentListCreateView.as_view(), name="env-list"),
    path("environments/<uuid:pk>/", views.EnvironmentDetailView.as_view(), name="env-detail"),
]
