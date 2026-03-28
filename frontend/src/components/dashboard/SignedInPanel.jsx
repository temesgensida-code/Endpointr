import { useRef, useState } from 'react'
import { UserButton, useAuth } from '@clerk/react'

import logo from '../../assets/dzuCC01.svg'
import ChatbotPanel from './ChatbotPanel'
import RequestBuilderPanel from './RequestBuilderPanel'
import StoryPanel from './StoryPanel'
import { sendChatMessageApi, fetchAiChatHistoryApi } from './services/chatService'
import { fetchRequestHistory } from './services/historyService'
import { sendProxyRequestApi } from './services/proxyService'

const MIN_PANEL_PERCENT = 15
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']

export default function SignedInPanel() {
  const { getToken, userId } = useAuth()
  const [proxyLoading, setProxyLoading] = useState(false)
  const [proxyResult, setProxyResult] = useState('')
  const [proxyError, setProxyError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyItems, setHistoryItems] = useState([])
  const [storyOpen, setStoryOpen] = useState(false)
  const [expandedHistoryIds, setExpandedHistoryIds] = useState({})
  const [requestMethod, setRequestMethod] = useState('GET')
  const [requestUrl, setRequestUrl] = useState('')
  const [requestJsonBody, setRequestJsonBody] = useState('{\n  \n}')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content:
        'I can help debug your API calls using your recent request/response history and general FastAPI, Django REST API, and React API-client guidance.',
    },
  ])

  const [aiHistoryOpen, setAiHistoryOpen] = useState(false)
  const [aiHistoryLoading, setAiHistoryLoading] = useState(false)
  const [aiHistoryItems, setAiHistoryItems] = useState([])
  const [conversationId, setConversationId] = useState(crypto.randomUUID())

  const [panelWidths, setPanelWidths] = useState([25, 50, 25])
  const rowRef = useRef(null)

  async function loadRequestHistory() {
    setHistoryLoading(true)
    setHistoryError('')

    try {
      const history = await fetchRequestHistory({ getToken, userId })
      setHistoryItems(history)
    } catch (error) {
      setHistoryError(error.message || 'Could not load story history.')
      setHistoryItems([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadAiHistory() {
    setAiHistoryLoading(true)
    try {
      const history = await fetchAiChatHistoryApi({ getToken, userId })
      setAiHistoryItems(history)
    } catch (error) {
      console.error("Failed to load AI history", error)
      setAiHistoryItems([])
    } finally {
      setAiHistoryLoading(false)
    }
  }

  function toggleAiHistory() {
    const nextOpen = !aiHistoryOpen
    setAiHistoryOpen(nextOpen)
    if (nextOpen) {
      loadAiHistory()
    }
  }

  async function selectAiHistoryMessage(item) {
    setAiHistoryOpen(false)
    setConversationId(item.conversation_id)
    setChatLoading(true)
    try {
      const history = await fetchAiChatHistoryApi({ 
        getToken, 
        userId, 
        action: 'get_conversation', 
        conversationId: item.conversation_id 
      })
      setChatMessages(history)
    } catch (e) {
      console.error(e)
    } finally {
      setChatLoading(false)
    }
  }

  function startNewAiChat() {
    setAiHistoryOpen(false)
    setConversationId(crypto.randomUUID())
    setChatMessages([
      {
        role: 'assistant',
        content:
          'I can help debug your API calls using your recent request/response history and general FastAPI, Django REST API, and React API-client guidance.',
      },
    ])
    setChatInput('')
  }

  function toggleStoryPanel() {
    const nextOpen = !storyOpen
    setStoryOpen(nextOpen)
    if (nextOpen) {
      loadRequestHistory()
    }
  }

  function toggleHistoryItem(itemId) {
    setExpandedHistoryIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }))
  }

  async function sendProxyRequest() {
    setProxyLoading(true)
    setProxyError('')
    setProxyResult('')

    try {
      const payload = await sendProxyRequestApi({
        getToken,
        userId,
        requestMethod,
        requestUrl,
        requestJsonBody,
      })

      setProxyResult(JSON.stringify(payload, null, 2))
    } catch (error) {
      setProxyError(error.message || 'Request failed.')
    } finally {
      setProxyLoading(false)
      if (storyOpen) {
        loadRequestHistory()
      }
    }
  }

  async function sendChatMessage() {
    const question = chatInput.trim()
    if (!question) {
      return
    }

    const userMessage = { role: 'user', content: question }
    setChatMessages((prev) => [...prev, userMessage])
    setChatInput('')
    setChatLoading(true)

    try {
      const payload = await sendChatMessageApi({
        getToken,
        userId,
        question,
        conversationId,
      })

      setChatMessages((prev) => [...prev, { role: 'assistant', content: payload.answer, contextIds: payload.contextIds }])
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `I could not answer right now: ${error.message || 'Unknown error.'}` },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  function startResize(splitIndex, event) {
    const rowEl = rowRef.current
    if (!rowEl) {
      return
    }

    const startX = event.clientX
    const startWidths = [...panelWidths]
    const rowWidth = rowEl.getBoundingClientRect().width
    const leftIndex = splitIndex
    const rightIndex = splitIndex + 1

    function onPointerMove(moveEvent) {
      if (!rowWidth) {
        return
      }

      const deltaPercent = ((moveEvent.clientX - startX) / rowWidth) * 100
      const pairTotal = startWidths[leftIndex] + startWidths[rightIndex]

      const nextLeft = clamp(
        startWidths[leftIndex] + deltaPercent,
        MIN_PANEL_PERCENT,
        pairTotal - MIN_PANEL_PERCENT,
      )
      const nextRight = pairTotal - nextLeft

      setPanelWidths((prev) => {
        const updated = [...prev]
        updated[leftIndex] = nextLeft
        updated[rightIndex] = nextRight
        return updated
      })
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <section className="dashboard">
      <div className="box navbar-box">
        <div className="navbar-title">
          <img src={logo} alt="Endpointr Logo" className="navbar-logo" />
        </div>
        <UserButton />
      </div>

      <div
        ref={rowRef}
        className="content-row"
        style={{
          gridTemplateColumns: `${panelWidths[0]}% var(--resizer-width) ${panelWidths[1]}% var(--resizer-width) ${panelWidths[2]}%`,
        }}
      >
        <StoryPanel
          storyOpen={storyOpen}
          onToggleStoryPanel={toggleStoryPanel}
          historyLoading={historyLoading}
          historyError={historyError}
          historyItems={historyItems}
          expandedHistoryIds={expandedHistoryIds}
          onToggleHistoryItem={toggleHistoryItem}
        />

        <div
          className="resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize between box 1 and box 2"
          onPointerDown={(event) => startResize(0, event)}
        />

        <RequestBuilderPanel
          requestMethod={requestMethod}
          onRequestMethodChange={setRequestMethod}
          requestUrl={requestUrl}
          onRequestUrlChange={setRequestUrl}
          requestJsonBody={requestJsonBody}
          onRequestJsonBodyChange={setRequestJsonBody}
          onSendProxyRequest={sendProxyRequest}
          proxyLoading={proxyLoading}
          proxyError={proxyError}
          proxyResult={proxyResult}
          methods={HTTP_METHODS}
        />

        <div
          className="resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize between box 2 and box 3"
          onPointerDown={(event) => startResize(1, event)}
        />

        <ChatbotPanel
          chatMessages={chatMessages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendChatMessage={sendChatMessage}
          chatLoading={chatLoading}
          aiHistoryOpen={aiHistoryOpen}
          onToggleAiHistory={toggleAiHistory}
          aiHistoryLoading={aiHistoryLoading}
          aiHistoryItems={aiHistoryItems}
          onSelectAiHistory={selectAiHistoryMessage}
          onStartNewAiChat={startNewAiChat}
        />
      </div>
    </section>
  )
}
