import ReactMarkdown from 'react-markdown'

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
}) {
  return (
    <div className="box content-box" id="box3">
      <h2>Assistant</h2>

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

      <button type="button" onClick={onSendChatMessage} disabled={chatLoading}>
        {chatLoading ? 'Thinking...' : 'Ask AI'}
      </button>
    </div>
  )
}
