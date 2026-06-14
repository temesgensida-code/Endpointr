from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/runs/(?P<run_id>[0-9a-f-]+)/live/$", consumers.RunLiveConsumer.as_asgi()),
    re_path(r"^ws/monitors/(?P<monitor_id>[0-9a-f-]+)/live/$", consumers.MonitorLiveConsumer.as_asgi()),
    re_path(r"^ws/projects/(?P<project_id>[0-9a-f-]+)/live/$", consumers.ProjectDashboardConsumer.as_asgi()),
]
