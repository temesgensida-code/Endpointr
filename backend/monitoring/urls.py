from django.urls import path
from . import views

urlpatterns = [
    path("", views.MonitorListCreateView.as_view(), name="monitor-list"),
    path("status/", views.MonitorStatusView.as_view(), name="monitor-status"),
    path("<uuid:pk>/", views.MonitorDetailView.as_view(), name="monitor-detail"),
    path("<uuid:pk>/probe/", views.ProbeNowView.as_view(), name="monitor-probe"),
    path("<uuid:monitor_pk>/incidents/", views.IncidentListView.as_view(), name="incident-list"),
    path(
        "<uuid:monitor_pk>/incidents/<uuid:pk>/resolve/",
        views.IncidentResolveView.as_view(), name="incident-resolve",
    ),
]
