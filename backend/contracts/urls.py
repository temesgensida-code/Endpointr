from django.urls import path
from . import views

urlpatterns = [
    path("snapshots/", views.SnapshotListCreateView.as_view(), name="snapshot-list"),
    path("diffs/", views.DiffListView.as_view(), name="diff-list"),
    path("diffs/<uuid:pk>/", views.DiffDetailView.as_view(), name="diff-detail"),
]
