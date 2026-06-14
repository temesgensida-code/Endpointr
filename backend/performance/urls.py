from django.urls import path
from . import views

urlpatterns = [
    path("", views.PerfConfigListCreateView.as_view(), name="perf-config-list"),
    path("regression/", views.PerfRegressionView.as_view(), name="perf-regression"),
    path("<uuid:pk>/", views.PerfConfigDetailView.as_view(), name="perf-config-detail"),
    path("<uuid:pk>/run/", views.PerfRunView.as_view(), name="perf-run"),
    path("<uuid:pk>/runs/", views.PerfRunListView.as_view(), name="perf-run-list"),
]
