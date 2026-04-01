import { CiSquareRemove } from 'react-icons/ci'
import { FaAngleDown } from "react-icons/fa";
import { FaChevronUp } from "react-icons/fa";

export default function StoryPanel({
  storyOpen,
  onToggleStoryPanel,
  historyLoading,
  historyError,
  historyItems,
  expandedHistoryIds,
  onToggleHistoryItem,
  onDeleteHistoryItem,
}) {
  return (
    <div className="box content-box" id="box1">
      <div className="history-btn">
      <button 
        type="button" 
        onClick={onToggleStoryPanel}
        style={{ 
          background: 'none', 
          border: 'none', 
          cursor: 'pointer', 
          padding: 0, 
          textAlign: 'left', 
          color: 'var(--text-h)', 
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        <h2>History</h2>
        <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{storyOpen ? <FaAngleDown /> : <FaChevronUp />}</span>
      </button>
      </div>

      {storyOpen ? (
        <div className="history-panel">
          {historyLoading ? <p>Loading recent requests...</p> : null}
          {historyError ? <p className="request-error">{historyError}</p> : null}

          {!historyLoading && !historyError && historyItems.length === 0 ? <p>No request story yet.</p> : null}

          {!historyLoading && !historyError ? (
            <div className="history-list">
              {historyItems.map((item) => {
                const expanded = !!expandedHistoryIds[item.id]
                return (
                  <div key={item.id} className="history-item">
                    <div className="history-item-header">
                      <div className="history-item-main">
                        <p className="history-item-id">ID: {item.id}</p>
                        <p className="history-item-url">{item.requested_url}</p>
                      </div>
                      <button
                        type="button"
                        className="history-expand-btn"
                        onClick={() => onToggleHistoryItem(item.id)}
                        aria-expanded={expanded}
                        aria-label={`Read more for request ${item.id}`}
                      >
                        {expanded ? 'v' : '>'}
                      </button>
                      <button
                        type="button"
                        className="history-delete-btn"
                        onClick={() => onDeleteHistoryItem(item.id)}
                        aria-label={`Remove history ${item.id}`}
                        title="Remove"
                      >
                        <CiSquareRemove />
                      </button>
                    </div>

                    {expanded ? (
                      <div className="history-item-body">
                        <p>Method: {item.method}</p>
                        <p>Status: {item.response_status_code ?? 'N/A'}</p>
                        <pre className="result">{JSON.stringify(item.response, null, 2)}</pre>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
