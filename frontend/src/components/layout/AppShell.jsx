import { useState, useCallback } from 'react'
import { useAuth } from '@clerk/react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import RequestBuilder from '../dashboard/services/RequestBuilder'
import ProjectsView from '../projects/ProjectsView'
import CollectionsView from '../collections/CollectionsView'
import WorkflowsView from '../workflows/WorkflowsView'
import PerformanceView from '../performance/PerformanceView'
import MonitoringView from '../monitoring/MonitoringView'
import ContractsView from '../contracts/ContractsView'
import SecurityView from '../security/SecurityView'
import DashboardView from '../dashboard/services/DashboardView'
import AiChatDrawer from '../ai/AiChatDrawer'

export default function AppShell() {
  const { getToken, userId } = useAuth()
  const [activeView, setActiveView] = useState('request-builder')
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [activeProjectName, setActiveProjectName] = useState('')
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)

  const selectProject = useCallback((id, name) => {
    setActiveProjectId(id)
    setActiveProjectName(name)
  }, [])

  const views = {
    'dashboard': <DashboardView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'request-builder': <RequestBuilder getToken={getToken} userId={userId} />,
    'projects': <ProjectsView getToken={getToken} onSelectProject={selectProject} activeProjectId={activeProjectId} onNavigate={setActiveView} />,
    'collections': <CollectionsView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'workflows': <WorkflowsView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'performance': <PerformanceView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'monitoring': <MonitoringView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'contracts': <ContractsView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
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
          onToggleAi={() => setAiDrawerOpen(p => !p)}
          aiOpen={aiDrawerOpen}
        />
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {views[activeView] || views['request-builder']}
        </main>
      </div>

      <AiChatDrawer
        isOpen={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        getToken={getToken}
        userId={userId}
      />
    </div>
  )
}
