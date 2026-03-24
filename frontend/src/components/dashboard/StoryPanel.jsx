export default function StoryPanel({
  storyOpen,
  onToggleStoryPanel,
  historyLoading,
  historyError,
  historyItems,
  expandedHistoryIds,
  onToggleHistoryItem,
}) {
  return (
    <div className="box content-box" id="box1">
      <h2>Story</h2>
      <button type="button" className="story-toggle" onClick={onToggleStoryPanel}>
        {storyOpen ? 'Hide Story' : 'Show Story'}
      </button>

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
