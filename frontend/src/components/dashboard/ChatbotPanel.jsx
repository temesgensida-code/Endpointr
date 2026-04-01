import ReactMarkdown from 'react-markdown'
import { FaHistory } from 'react-icons/fa'
import { CiSquareRemove } from 'react-icons/ci'

function toSafeText(value) {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

export default function ChatbotPanel({
  chatMessages,
  chatInput,
  onChatInputChange,
  onSendChatMessage,
  chatLoading,
  aiHistoryOpen,
  onToggleAiHistory,
  aiHistoryLoading,
  aiHistoryItems,
  onSelectAiHistory,
  onStartNewAiChat,
  onDeleteAiHistory,
}) {
  return (
    <div className="box content-box" id="box3" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Assistant</h2>
        <button 
          type="button" 
          onClick={onToggleAiHistory}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          aria-label="Toggle AI History"
        >
          <FaHistory size={18} color="var(--text-h)" />
        </button>
      </div>

      {aiHistoryOpen && (
        <div style={{
          position: 'absolute',
          top: '36px',
          right: '8px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          boxShadow: 'var(--shadow)',
          zIndex: 10,
          width: '250px',
          maxHeight: '300px',
          overflow: 'auto',
          padding: '8px'
        }}>
          <h3 style={{ fontSize: '14px', marginTop: 0, marginBottom: '8px' }}>Recent AI Stories</h3>
          {aiHistoryLoading ? (
            <p style={{ fontSize: '13px' }}>Loading...</p>
          ) : aiHistoryItems.length === 0 ? (
            <p style={{ fontSize: '13px' }}>No stories yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {aiHistoryItems.map(item => (
                <div 
                  key={item.id} 
                  style={{ 
                    padding: '8px', 
                    background: 'var(--code-bg)', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                  onClick={() => onSelectAiHistory(item)}
                >
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="history-delete-btn"
                      style={{ border: 'none', background: 'transparent', padding: 0, lineHeight: 0 }}
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteAiHistory(item)
                      }}
                      aria-label={`Remove chat history ${item.id}`}
                      title="Remove"
                    >
                      <CiSquareRemove />
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '4px' }}>
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                  <div style={{ 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis' 
                  }}>
                    {item.content}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <button
            type="button"
            className="ask-ai-btn"
            style={{ width: '100%', marginTop: '12px' }}
            onClick={onStartNewAiChat}
          >
            + New Chat
          </button>
        </div>
      )}

      <div className="chat-window">
        {chatMessages.map((msg, idx) => (
          <div
            key={`${msg.role}-${idx}`}
            className={`chat-message ${msg.role === 'user' ? 'chat-user' : 'chat-assistant'}`}
          >
            <p className="chat-role">{msg.role === 'user' ? 'You' : 'Assistant'}</p>
            {msg.role === 'assistant' ? (
              <div className="chat-content markdown-content">
                <ReactMarkdown>{toSafeText(msg.content)}</ReactMarkdown>
              </div>
            ) : (
              <p className="chat-content">{toSafeText(msg.content)}</p>
            )}
            {msg.role === 'assistant' && Array.isArray(msg.contextIds) && msg.contextIds.length > 0 ? (
              <div className="chat-citations">
                <p className="chat-citations-label">Sources:</p>
                <div className="chat-citation-list">
                  {msg.contextIds.map((id) => (
                    <span key={`${idx}-src-${id}`} className="chat-citation-chip">
                      Request #{id}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <textarea
        className="request-control chat-input"
        placeholder="Ask about your API responses, endpoint errors, or debugging strategies..."
        value={chatInput}
        onChange={(event) => onChatInputChange(event.target.value)}
        spellCheck={false}
      />

      <button type="button" className="ask-ai-btn" onClick={onSendChatMessage} disabled={chatLoading} style={{ marginTop: '8px' }}>
        {chatLoading ? 'Thinking...' : 'Ask AI'}
      </button>
    </div>
  )
}
