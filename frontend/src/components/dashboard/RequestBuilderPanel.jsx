export default function RequestBuilderPanel({
  requestMethod,
  onRequestMethodChange,
  requestUrl,
  onRequestUrlChange,
  requestJsonBody,
  onRequestJsonBodyChange,
  onSendProxyRequest,
  proxyLoading,
  proxyError,
  proxyResult,
  methods,
}) {
  return (
    <div className="box content-box" id="box2">
      <h2>Request Builder</h2>

      <label htmlFor="http-method">Method</label>
      <select
        id="http-method"
        className="request-control"
        value={requestMethod}
        onChange={(event) => onRequestMethodChange(event.target.value)}
      >
        {methods.map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>

      <label htmlFor="request-url">URL</label>
      <input
        id="request-url"
        className="request-control"
        type="url"
        placeholder="https://api.example.com/resource"
        value={requestUrl}
        onChange={(event) => onRequestUrlChange(event.target.value)}
      />

      <label htmlFor="request-json">JSON Body</label>
      <textarea
        id="request-json"
        className="request-control request-json"
        value={requestJsonBody}
        onChange={(event) => onRequestJsonBodyChange(event.target.value)}
        spellCheck={false}
      />

      <button type="button" onClick={onSendProxyRequest} disabled={proxyLoading}>
        {proxyLoading ? 'Sending...' : 'Send Request'}
      </button>

      {proxyError ? <p className="request-error">{proxyError}</p> : null}
      <div className="response">
        {proxyResult ? <pre className="result">{proxyResult}</pre> : <p>Response from proxy will appear here.</p>}
      </div>
    </div>
  )
}
