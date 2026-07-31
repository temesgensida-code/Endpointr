import { useState, useCallback } from 'react'
import Navbar from './Navbar'
import TestAlternativesBar from './TestAlternativesBar'
import HomeView from './HomeView'
import RequestBuilder from '../dashboard/services/RequestBuilder'
import ProjectsView from '../projects/ProjectsView'
import CollectionsView from '../collections/CollectionsView'
import WorkflowsView from '../workflows/WorkflowsView'
import PerformanceView from '../performance/PerformanceView'
import MonitoringView from '../monitoring/MonitoringView'
import ContractsView from '../contracts/ContractsView'
import SecurityView from '../security/SecurityView'
import AiChatDrawer from '../ai/AiChatDrawer'

export default function AppShell() {
  const userId = 'single_user'
  const getToken = null

  const [activeView, setActiveView] = useState('request-builder')
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [activeProjectName, setActiveProjectName] = useState('')
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)

  const selectProject = useCallback((id, name) => {
    setActiveProjectId(id)
    setActiveProjectName(name)
    /* When a project is selected, default to request builder */
    setActiveView('request-builder')
  }, [])

  const views = {
    'request-builder': <RequestBuilder getToken={getToken} userId={userId} />,
    'projects':        <ProjectsView getToken={getToken} onSelectProject={selectProject} activeProjectId={activeProjectId} onNavigate={setActiveView} />,
    'collections':     <CollectionsView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'workflows':       <WorkflowsView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'performance':     <PerformanceView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'monitoring':      <MonitoringView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'contracts':       <ContractsView getToken={getToken} projectId={activeProjectId} onNavigate={setActiveView} />,
    'security':        <SecurityView getToken={getToken} />,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>

      {/* ── Top navbar (always visible) ── */}
      <Navbar
        getToken={getToken}
        activeProjectId={activeProjectId}
        activeProjectName={activeProjectName}
        onSelectProject={selectProject}
        onToggleAi={() => setAiDrawerOpen(p => !p)}
        aiOpen={aiDrawerOpen}
      />

      {/* ── Content area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {activeProjectId ? (
          <>
            {/* Testing alternatives bar — shown only when a project is active */}
            <TestAlternativesBar activeView={activeView} onNavigate={setActiveView} />

            {/* Active feature view */}
            <main style={{ flex: 1, overflow: 'hidden' }}>
              {views[activeView] || views['request-builder']}
            </main>
          </>
        ) : (
          /* No project selected — show home/landing */
          <HomeView getToken={getToken} onSelectProject={selectProject} />
        )}
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
