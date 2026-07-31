import { useState, useRef, useEffect } from 'react'

export default function WorkflowCanvas({
  definition,
  onChange,
  onSelectNode,
  selectedNodeId,
  liveMetrics = {}, // { node_id: { status, duration_ms } }
  nodeResults = [], // array of nodeResult from completed run
  onInspectResult,
}) {
  const canvasRef = useRef(null)
  const [draggingNodeId, setDraggingNodeId] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [connectingSourceId, setConnectingSourceId] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const nodes = definition?.nodes || []
  const edges = definition?.edges || []

  // Mapping from node ID to node execution status
  const resultMap = {}
  nodeResults.forEach(r => { resultMap[r.node_id] = r })

  const handleMouseDownNode = (e, node) => {
    if (e.button !== 0) return
    e.stopPropagation()
    onSelectNode(node.id)

    const rect = canvasRef.current.getBoundingClientRect()
    setDraggingNodeId(node.id)
    setDragOffset({
      x: e.clientX - rect.left - (node.position?.x || 100),
      y: e.clientY - rect.top - (node.position?.y || 100),
    })
  }

  const handleMouseMove = (e) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setMousePos({ x, y })

    if (draggingNodeId) {
      const newX = Math.max(20, Math.round((x - dragOffset.x) / 10) * 10)
      const newY = Math.max(20, Math.round((y - dragOffset.y) / 10) * 10)

      const updatedNodes = nodes.map(n =>
        n.id === draggingNodeId ? { ...n, position: { x: newX, y: newY } } : n
      )
      onChange({ nodes: updatedNodes, edges })
    }
  }

  const handleMouseUp = () => {
    setDraggingNodeId(null)
    setConnectingSourceId(null)
  }

  const handleStartConnect = (e, nodeId) => {
    e.stopPropagation()
    setConnectingSourceId(nodeId)
  }

  const handleEndConnect = (e, targetNodeId) => {
    e.stopPropagation()
    if (!connectingSourceId || connectingSourceId === targetNodeId) {
      setConnectingSourceId(null)
      return
    }

    // Avoid duplicate edge
    const exists = edges.some(
      edge => edge.source === connectingSourceId && edge.target === targetNodeId
    )
    if (!exists) {
      const newEdge = {
        id: `e-${connectingSourceId}-${targetNodeId}`,
        source: connectingSourceId,
        target: targetNodeId,
      }
      onChange({ nodes, edges: [...edges, newEdge] })
    }
    setConnectingSourceId(null)
  }

  const deleteEdge = (e, edgeId) => {
    e.stopPropagation()
    onChange({ nodes, edges: edges.filter(e => e.id !== edgeId) })
  }

  // Calculate coordinates for output/input ports
  const getNodePorts = (n) => {
    const posX = n.position?.x || 100
    const posY = n.position?.y || 100
    const width = 200
    const height = 110

    return {
      in: { x: posX, y: posY + height / 2 },
      out: { x: posX + width, y: posY + height / 2 },
    }
  }

  return (
    <div
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 520,
        background: 'var(--bg-card)',
        backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        borderRadius: 'var(--r3)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* SVG Canvas for Edge Wiring */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
          </marker>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
          </marker>
        </defs>

        {/* Existing Edges */}
        {edges.map(edge => {
          const srcNode = nodes.find(n => n.id === edge.source)
          const tgtNode = nodes.find(n => n.id === edge.target)
          if (!srcNode || !tgtNode) return null

          const srcPort = getNodePorts(srcNode).out
          const tgtPort = getNodePorts(tgtNode).in

          // Bezier control points
          const dx = Math.abs(tgtPort.x - srcPort.x) / 2
          const pathD = `M ${srcPort.x} ${srcPort.y} C ${srcPort.x + dx} ${srcPort.y}, ${tgtPort.x - dx} ${tgtPort.y}, ${tgtPort.x} ${tgtPort.y}`

          const isSrcRunning = liveMetrics[edge.source]?.status === 'running'

          return (
            <g key={edge.id} style={{ pointerEvents: 'all' }}>
              <path
                d={pathD}
                fill="none"
                stroke={isSrcRunning ? 'var(--primary)' : 'var(--border-strong)'}
                strokeWidth={isSrcRunning ? 2.5 : 2}
                strokeDasharray={isSrcRunning ? '4 4' : 'none'}
                markerEnd={isSrcRunning ? 'url(#arrow-active)' : 'url(#arrow)'}
              />
              {/* Invisible clickable path for edge deletion */}
              <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                style={{ cursor: 'pointer' }}
                onClick={(e) => deleteEdge(e, edge.id)}
              >
                <title>Click to disconnect steps</title>
              </path>
            </g>
          )
        })}

        {/* In-progress Connecting Wire */}
        {connectingSourceId && (() => {
          const srcNode = nodes.find(n => n.id === connectingSourceId)
          if (!srcNode) return null
          const srcPort = getNodePorts(srcNode).out
          const dx = Math.abs(mousePos.x - srcPort.x) / 2
          const pathD = `M ${srcPort.x} ${srcPort.y} C ${srcPort.x + dx} ${srcPort.y}, ${mousePos.x - dx} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`
          return (
            <path
              d={pathD}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="4 4"
              markerEnd="url(#arrow)"
            />
          )
        })()}
      </svg>

      {/* Nodes Render Loop */}
      {nodes.map(node => {
        const isSelected = node.id === selectedNodeId
        const posX = node.position?.x || 100
        const posY = node.position?.y || 100

        const live = liveMetrics[node.id]
        const finishedResult = resultMap[node.id]
        const currentStatus = live?.status || finishedResult?.status || 'idle'

        const method = node.data?.method || (node.type === 'delay' ? 'WAIT' : node.type === 'condition' ? 'IF' : 'GET')
        const extractors = node.data?.extractors || []
        const assertions = node.data?.assertions || []

        return (
          <div
            key={node.id}
            onMouseDown={(e) => handleMouseDownNode(e, node)}
            style={{
              position: 'absolute',
              left: posX,
              top: posY,
              width: 200,
              background: 'var(--bg-overlay)',
              borderRadius: 'var(--r2)',
              border: `1px solid ${
                currentStatus === 'running'
                  ? 'var(--primary)'
                  : currentStatus === 'passed'
                  ? 'var(--green)'
                  : currentStatus === 'failed'
                  ? 'var(--red)'
                  : isSelected
                  ? 'var(--accent)'
                  : 'var(--border-strong)'
              }`,
              boxShadow: isSelected
                ? '0 0 0 2px var(--accent-alpha), 0 4px 16px rgba(0,0,0,0.4)'
                : currentStatus === 'running'
                ? '0 0 12px var(--primary-alpha)'
                : '0 2px 8px rgba(0,0,0,0.2)',
              cursor: 'grab',
              zIndex: isSelected ? 10 : 2,
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          >
            {/* Input Port Anchor (Target) */}
            <div
              onMouseUp={(e) => handleEndConnect(e, node.id)}
              style={{
                position: 'absolute',
                left: -7,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: 'var(--bg-card)',
                border: '2px solid var(--accent)',
                cursor: 'crosshair',
                zIndex: 5,
              }}
              title="Input port (drop connection here)"
            />

            {/* Output Port Anchor (Source) */}
            <div
              onMouseDown={(e) => handleStartConnect(e, node.id)}
              style={{
                position: 'absolute',
                right: -7,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: 'var(--accent)',
                border: '2px solid var(--bg-card)',
                cursor: 'crosshair',
                zIndex: 5,
              }}
              title="Drag wire from output port to next step"
            />

            {/* Node Card Header */}
            <div
              style={{
                padding: '6px 10px',
                borderBottom: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.02)',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                gap: 6,
              }}
            >
              <span className={`method method-${method}`} style={{ fontSize: 9, padding: '2px 6px' }}>
                {method}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--tx-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {node.data?.label || node.id}
              </span>
              {currentStatus !== 'idle' && (
                <span className={`badge ${
                  currentStatus === 'passed' ? 'badge-green' :
                  currentStatus === 'failed' ? 'badge-red' :
                  currentStatus === 'running' ? 'badge-blue' : 'badge-muted'
                }`} style={{ fontSize: 8, padding: '1px 4px' }}>
                  {currentStatus}
                </span>
              )}
            </div>

            {/* Node Card Content Summary */}
            <div style={{ padding: '8px 10px', fontSize: 10, color: 'var(--tx-muted)' }}>
              {node.type === 'delay' ? (
                <div>Delay: <strong style={{ color: 'var(--tx-secondary)' }}>{node.data?.delay_ms || 1000}ms</strong></div>
              ) : node.type === 'condition' ? (
                <div>If var: <strong style={{ color: 'var(--tx-secondary)' }}>{node.data?.var_name || 'variable'}</strong></div>
              ) : (
                <div
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--tx-secondary)',
                    marginBottom: 4,
                  }}
                  title={node.data?.url || 'Configure URL'}
                >
                  {node.data?.url || 'https://api.example.com'}
                </div>
              )}

              {/* Extras indicators */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {extractors.length > 0 && (
                  <span className="badge badge-violet" style={{ fontSize: 8 }}>
                    ⚡ {extractors.length} var{extractors.length > 1 ? 's' : ''}
                  </span>
                )}
                {assertions.length > 0 && (
                  <span className="badge badge-yellow" style={{ fontSize: 8 }}>
                    ✓ {assertions.length} assert{assertions.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Finished execution metrics shortcut */}
              {finishedResult && (
                <div
                  onClick={(e) => { e.stopPropagation(); onInspectResult(finishedResult) }}
                  style={{
                    marginTop: 6,
                    padding: '3px 6px',
                    background: 'var(--bg-card)',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    cursor: 'pointer',
                    color: 'var(--accent)',
                    fontWeight: 500,
                  }}
                  title="Inspect detailed response payload & headers"
                >
                  <span>{finishedResult.status_code ? `${finishedResult.status_code}` : 'Result'}</span>
                  <span>{finishedResult.duration_ms}ms →</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
