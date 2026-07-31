export default function WorkflowTemplatesModal({ onSelectTemplate, onClose }) {
  const templates = [
    {
      id: 'auth_chain',
      title: 'OAuth2 Authentication & Chained API Request',
      description: 'Authenticates via POST to retrieve a bearer token, extracts the token, and passes it in the Authorization header to fetch user profile.',
      nodes: [
        {
          id: 'step_auth',
          type: 'request',
          position: { x: 40, y: 160 },
          data: {
            label: '1. Login & Get Token',
            method: 'POST',
            url: 'https://httpbin.org/post',
            expected_status: 200,
            body: '{\n  "username": "developer@endpointr.io",\n  "password": "secret_password"\n}',
            extractors: [
              { json_path: 'json.username', var_name: 'authenticated_user' }
            ],
            assertions: [
              { type: 'max_latency', max_ms: 1000 }
            ]
          }
        },
        {
          id: 'step_profile',
          type: 'request',
          position: { x: 300, y: 160 },
          data: {
            label: '2. Fetch User Profile',
            method: 'GET',
            url: 'https://httpbin.org/headers',
            expected_status: 200,
            headers: [
              { key: 'Authorization', value: 'Bearer {{authenticated_user}}' }
            ],
            assertions: [
              { type: 'max_latency', max_ms: 500 }
            ]
          }
        }
      ],
      edges: [
        { id: 'e-1', source: 'step_auth', target: 'step_profile' }
      ]
    },
    {
      id: 'crud_lifecycle',
      title: 'CRUD Lifecycle Pipeline',
      description: 'Full REST lifecycle test: Create item -> Verify item -> Update item -> Delete item.',
      nodes: [
        {
          id: 'step_create',
          type: 'request',
          position: { x: 40, y: 160 },
          data: {
            label: 'Create Resource',
            method: 'POST',
            url: 'https://httpbin.org/post',
            expected_status: 200,
            body: '{\n  "title": "New Test Resource",\n  "category": "QA"\n}',
            extractors: [
              { json_path: 'json.title', var_name: 'item_title' }
            ]
          }
        },
        {
          id: 'step_verify',
          type: 'request',
          position: { x: 280, y: 160 },
          data: {
            label: 'Verify Created Item',
            method: 'GET',
            url: 'https://httpbin.org/get?item={{item_title}}',
            expected_status: 200
          }
        },
        {
          id: 'step_delay',
          type: 'delay',
          position: { x: 520, y: 160 },
          data: {
            label: 'Wait Buffer',
            delay_ms: 500
          }
        },
        {
          id: 'step_delete',
          type: 'request',
          position: { x: 740, y: 160 },
          data: {
            label: 'Delete Resource',
            method: 'DELETE',
            url: 'https://httpbin.org/delete',
            expected_status: 200
          }
        }
      ],
      edges: [
        { id: 'e-1', source: 'step_create', target: 'step_verify' },
        { id: 'e-2', source: 'step_verify', target: 'step_delay' },
        { id: 'e-3', source: 'step_delay', target: 'step_delete' }
      ]
    },
    {
      id: 'parallel_health',
      title: 'Parallel Endpoint Health Check',
      description: 'Executes parallel requests to multiple endpoints concurrently to verify latency SLAs.',
      nodes: [
        {
          id: 'step_api_v1',
          type: 'request',
          position: { x: 60, y: 80 },
          data: {
            label: 'Health Check /v1',
            method: 'GET',
            url: 'https://httpbin.org/status/200',
            expected_status: 200,
            assertions: [
              { type: 'max_latency', max_ms: 400 }
            ]
          }
        },
        {
          id: 'step_api_v2',
          type: 'request',
          position: { x: 60, y: 240 },
          data: {
            label: 'Health Check /v2',
            method: 'GET',
            url: 'https://httpbin.org/status/200',
            expected_status: 200,
            assertions: [
              { type: 'max_latency', max_ms: 400 }
            ]
          }
        }
      ],
      edges: []
    }
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justify: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 540,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r3)',
          padding: 'var(--s5)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s4)' }}>
          <div>
            <h2 style={{ fontSize: 16, marginBottom: 2 }}>Workflow Templates</h2>
            <p style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Select a pre-built template to populate your workflow testing canvas</p>
          </div>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
          {templates.map(tpl => (
            <div
              key={tpl.id}
              className="card card-hover"
              style={{ padding: '12px 14px', cursor: 'pointer' }}
              onClick={() => { onSelectTemplate(tpl); onClose() }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h4 style={{ fontSize: 13, color: 'var(--tx-primary)' }}>{tpl.title}</h4>
                <span className="badge badge-blue" style={{ fontSize: 9 }}>{tpl.nodes.length} steps</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--tx-muted)', lineHeight: 1.4 }}>{tpl.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
