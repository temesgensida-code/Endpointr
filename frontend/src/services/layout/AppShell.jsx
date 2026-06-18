import { useState, useCallback } from 'react'
import { UserButton, useAuth } from '@clerk/react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import RequestBuilder from '../dashboard/RequestBuilder'
import ProjectsView from '../projects/ProjectsView'
import CollectionsView from '../collections/CollectionsView'
import WorkflowsView from '../workflows/WorkflowsView'
import PerformanceView from '../performance/PerformanceView'
import MonitoringView from '../monitoring/MonitoringView'
import ContractsView from '../contracts/ContractsView'
import SecurityView from '../security/SecurityView'
import DashboardView from '../dashboard/DashboardView'

export default function AppShell() {
  const { getToken, userId } = useAuth()
  const [activeView, setActiveView] = useState('request-builder')
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [activeProjectName, setActiveProjectName] = useState('')

  const selectProject = useCallback((id, name) => {
    setActiveProjectId(id)
    setActiveProjectName(name)
  }, [])

  const views = {
    'dashboard': <DashboardView getToken={getToken} projectId={activeProjectId} />,
    'request-builder': <RequestBuilder getToken={getToken} userId={userId} />,
    'projects': <ProjectsView getToken={getToken} onSelectProject={selectProject} activeProjectId={activeProjectId} />,
    'collections': <CollectionsView getToken={getToken} projectId={activeProjectId} />,
    'workflows': <WorkflowsView getToken={getToken} projectId={activeProjectId} />,
    'performance': <PerformanceView getToken={getToken} projectId={activeProjectId} />,
    'monitoring': <MonitoringView getToken={getToken} projectId={activeProjectId} />,
    'contracts': <ContractsView getToken={getToken} projectId={activeProjectId} />,
    'security': <SecurityView getToken={getToken} />,
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        projectName={activeProjectName}
        hasProject={!!activeProjectId}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Navbar
          activeView={activeView}
          projectName={activeProjectName}
          getToken={getToken}
        />
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {views[activeView] || views['request-builder']}
        </main>
      </div>
    </div>
  )
}
