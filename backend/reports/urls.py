from django.urls import path
from . import views

urlpatterns = [
    path("dashboard/", views.ProjectDashboardView.as_view(), name="report-dashboard"),
    path("performance/", views.PerfSummaryView.as_view(), name="report-perf"),
    path("sla/", views.MonitoringSLAView.as_view(), name="report-sla"),
]
