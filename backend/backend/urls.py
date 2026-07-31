"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path

from workflows.internal_views import update_workflow_run
from performance.internal_views import update_perf_run

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api-request/', include('API_request.urls')),
    path('auth/', include('Authentication.urls')),
    path('ai/', include('AI_handler.urls')),

    # Primary user-facing project routes
    path('projects/', include('projects.urls')),
    path('projects/<uuid:project_pk>/workflows/', include('workflows.urls')),
    path('projects/<uuid:project_pk>/performance/', include('performance.urls')),
    path('projects/<uuid:project_pk>/collections/', include('api_collections.urls')),
    path('projects/<uuid:project_pk>/monitoring/', include('monitoring.urls')),
    path('projects/<uuid:project_pk>/contracts/', include('contracts.urls')),
    path('projects/<uuid:project_pk>/security/', include('security_tools.urls')),
    path('projects/<uuid:project_pk>/reports/', include('reports.urls')),
    path('projects/<uuid:project_pk>/documentation/', include('documentation.urls')),
    path('projects/<uuid:project_pk>/audit/', include('audit.urls')),

    path('security/', include('security_tools.urls')),
    path('api/security/', include('security_tools.urls')),

    # Standard /api/ prefix routes
    path('api/projects/', include('projects.urls')),
    path('api/projects/<uuid:project_pk>/workflows/', include('workflows.urls')),
    path('api/projects/<uuid:project_pk>/performance/', include('performance.urls')),
    path('api/projects/<uuid:project_pk>/collections/', include('api_collections.urls')),
    path('api/projects/<uuid:project_pk>/monitoring/', include('monitoring.urls')),
    path('api/projects/<uuid:project_pk>/contracts/', include('contracts.urls')),
    path('api/projects/<uuid:project_pk>/security/', include('security_tools.urls')),
    path('api/projects/<uuid:project_pk>/reports/', include('reports.urls')),
    path('api/projects/<uuid:project_pk>/documentation/', include('documentation.urls')),
    path('api/projects/<uuid:project_pk>/audit/', include('audit.urls')),

    # Internal routes called by Go execution-service
    path('internal/workflow-runs/<uuid:run_id>/', update_workflow_run),
    path('internal/perf-runs/<uuid:run_id>/', update_perf_run),
]
