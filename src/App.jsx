import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import Composer from './components/Composer'
import Message from './components/Message'
import RightPanel from './components/RightPanel'
import Settings from './components/Settings'
import CommandPalette from './components/CommandPalette'
import Icon from './components/Icon'
import { runAgent, titleFor } from './lib/agent'
import { api } from './lib/api'
import { suggestions } from './lib/workspace'

let seq = 0
const uid = (p) => p + '-' + (++seq) + '-' + Date.now().toString(36).slice(-4)
const nowTime = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const STATUS_LABEL = {
  thinking: 'Thinking',
  working: 'Running tools',
  writing: 'Writing response',
  waiting: 'Waiting for approval',
  idle: 'Ready',
}

const SESSIONS_KEY = 'kodo.sessions.v2'

function newSessionObject(model) {
  const now = Date.now()
  return { id: uid('s'), title: 'New session', created: now, updatedAt: now, model, tokens: 0, lastInput: 0, messages: [] }
}

function loadSessions(model) {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]')
    if (Array.isArray(raw) && raw.length) {
      // Anything that was mid-flight when the page closed can't still be running.
      return raw.map((s) => ({
        ...s,
        messages: (s.messages || []).map((m) =>
          m.role === 'assistant'
            ? {
                ...m,
                parts: (m.parts || []).map((p) =>
                  p.type === 'tool' && (p.status === 'running' || p.status === 'pending')
                    ? { ...p, status: 'aborted', approvalId: null }
                    : p.status === 'streaming'
                      ? { ...p, status: 'done' }
                      : p,
                ),
              }
            : m,
        ),
      }))
    }
  } catch {
    /* fall through */
  }
  return [newSessionObject(model)]
}

export default function App() {
  const [model, setModel] = useState(() => localStorage.getItem('kodo.model') || '')
  const [sessions, setSessions] = useState(() => loadSessions(localStorage.getItem('kodo.model') || ''))
  const [activeId, setActiveId] = useState(() => sessions0Id())
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('idle')
  const [autoApprove, setAutoApprove] = useState(() => localStorage.getItem('kodo.autoApprove') === '1')
  const [theme, setTheme] = useState(() => localStorage.getItem('kodo.theme') || 'dark')
  const [sideOpen, setSideOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState('changes')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [atBottom, setAtBottom] = useState(true)
  const [server, setServer] = useState(null)
  const [serverError, setServerError] = useState('')
  const [models, setModels] = useState([])
  const [modelErrors, setModelErrors] = useState({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [rev, setRev] = useState(0)

  const abortRef = useRef(null)
  const composerRef = useRef(null)
  const scrollRef = useRef(null)
  const stickRef = useRef(true)

  const active = useMemo(() => sessions.find((s) => s.id === activeId) || sessions[0] || null, [sessions, activeId])
  const messages = useMemo(() => active?.messages || [], [active])
  const activeModel = models.find((m) => m.id === model)
  const workspace = server?.workspace || { name: '…', path: '', branch: null, ahead: 0, git: false }

  // ------------------------------------------------------------ server state

  const refreshState = useCallback(async () => {
    try {
      setServer(await api.state())
      setServerError('')
    } catch (e) {
      setServerError(e.message)
    }
  }, [])

  const refreshModels = useCallback(async (fresh) => {
    setModelsLoading(true)
    try {
      const data = await api.models(fresh)
      setModels(data.models)
      setModelErrors(data.errors || {})
      setModel((cur) => (data.models.some((m) => m.id === cur) || !data.models.length ? cur : data.models[0].id))
    } catch (e) {
      setModelErrors({ _: e.message })
    } finally {
      setModelsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshState()
    refreshModels(false)
  }, [refreshState, refreshModels])

  const refreshAll = useCallback(
    (fresh = true) => {
      refreshState()
      refreshModels(fresh)
    },
    [refreshState, refreshModels],
  )

  // ------------------------------------------------------------ persistence

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kodo.theme', theme)
  }, [theme])

  useEffect(() => {
    if (model) localStorage.setItem('kodo.model', model)
  }, [model])

  useEffect(() => {
    localStorage.setItem('kodo.autoApprove', autoApprove ? '1' : '0')
  }, [autoApprove])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
      } catch {
        /* storage full or unavailable */
      }
    }, 400)
    return () => clearTimeout(t)
  }, [sessions])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 2600)
      return () => clearTimeout(t)
    }
  }, [toast])

  // ------------------------------------------------------------ session helpers

  const patchSession = useCallback((id, fn) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? fn(s) : s)))
  }, [])

  const patchAssistant = useCallback(
    (sessionId, msgId, fn) => {
      patchSession(sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) => (m.id === msgId ? fn(m) : m)),
      }))
    },
    [patchSession],
  )

  const scrollToBottom = useCallback((force) => {
    const el = scrollRef.current
    if (!el) return
    if (force || stickRef.current) el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    stickRef.current = dist < 80
    setAtBottom(dist < 80)
  }

  // ------------------------------------------------------------ sending

  const send = useCallback(
    async (text, baseMessages) => {
      if (busy || !active) return
      if (!model) {
        setToast({ kind: 'error', text: 'Add a provider and pick a model first.' })
        setSettingsOpen(true)
        return
      }
      const sessionId = active.id
      const history = baseMessages ?? active.messages
      const userMsg = { id: uid('u'), role: 'user', content: text, time: nowTime() }
      const assistantMsg = {
        id: uid('a'),
        role: 'assistant',
        time: nowTime(),
        model: activeModel?.name || model.split(':').slice(1).join(':'),
        parts: [],
        tokens: 0,
      }

      patchSession(sessionId, (s) => ({
        ...s,
        title: history.length === 0 ? titleFor(text) : s.title,
        updatedAt: Date.now(),
        messages: [...history, userMsg, assistantMsg],
        model,
      }))

      stickRef.current = true
      setBusy(true)
      setStatus('thinking')

      const controller = new AbortController()
      abortRef.current = controller

      let outTokens = 0
      let lastInput = 0
      let totalTokens = 0
      const patchParts = (fn) =>
        patchAssistant(sessionId, assistantMsg.id, (m) => ({ ...m, parts: fn(m.parts) }))
      const mapPart = (id, fn) => patchParts((parts) => parts.map((p) => (p.id === id ? fn(p) : p)))

      const emit = (evt) => {
        switch (evt.type) {
          case 'status':
            setStatus(evt.status)
            break
          case 'reasoning-start':
            patchParts((parts) => [...parts, { type: 'reasoning', id: evt.id, text: '', status: 'streaming' }])
            break
          case 'reasoning-delta':
            mapPart(evt.id, (p) => ({ ...p, text: p.text + evt.text }))
            break
          case 'reasoning-end':
            mapPart(evt.id, (p) => ({ ...p, status: 'done' }))
            break
          case 'text-start':
            patchParts((parts) => [...parts, { type: 'text', id: evt.id, text: '', status: 'streaming' }])
            break
          case 'text-delta':
            mapPart(evt.id, (p) => ({ ...p, text: p.text + evt.text }))
            break
          case 'text-end':
            mapPart(evt.id, (p) => ({ ...p, status: 'done' }))
            break
          case 'tool-start':
            patchParts((parts) => [...parts, { type: 'tool', ...evt.tool }])
            break
          case 'tool-update':
            mapPart(evt.id, (p) => ({ ...p, ...evt.patch }))
            break
          case 'tool-end':
            mapPart(evt.id, (p) => ({ ...p, ...evt.patch, status: evt.status }))
            break
          case 'usage':
            outTokens += evt.output || 0
            totalTokens += (evt.input || 0) + (evt.output || 0)
            lastInput = evt.input || lastInput
            patchAssistant(sessionId, assistantMsg.id, (m) => ({ ...m, tokens: outTokens }))
            break
          case 'error':
            patchParts((parts) => [...parts, { type: 'error', id: uid('e'), text: evt.message }])
            break
          default:
            break
        }
      }

      try {
        await runAgent({ model, messages: history.concat(userMsg), autoApprove, signal: controller.signal, emit })
      } catch (e) {
        patchAssistant(sessionId, assistantMsg.id, (m) => ({
          ...m,
          parts: [...m.parts, { type: 'error', id: uid('e'), text: e.message }],
        }))
      } finally {
        abortRef.current = null
        setBusy(false)
        setStatus('idle')
        patchAssistant(sessionId, assistantMsg.id, (m) => ({
          ...m,
          parts: m.parts.map((p) =>
            p.type === 'tool' && (p.status === 'running' || p.status === 'pending')
              ? { ...p, status: 'aborted', approvalId: null }
              : p.status === 'streaming'
                ? { ...p, status: 'done' }
                : p,
          ),
        }))
        patchSession(sessionId, (s) => ({ ...s, tokens: s.tokens + totalTokens, lastInput: lastInput || s.lastInput }))
        setRev((r) => r + 1)
      }
    },
    [active, activeModel, autoApprove, busy, model, patchAssistant, patchSession],
  )

  function stop() {
    abortRef.current?.abort()
  }

  async function decide(id, allow) {
    try {
      await api.approve(id, allow)
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }

  function newSession() {
    abortRef.current?.abort()
    const s = newSessionObject(model)
    setSessions((prev) => [s, ...prev])
    setActiveId(s.id)
    setSideOpen(false)
    stickRef.current = true
  }

  function deleteSession(id) {
    if (id === active?.id) abortRef.current?.abort()
    const next = sessions.filter((s) => s.id !== id)
    if (next.length === 0) {
      const fresh = newSessionObject(model)
      setSessions([fresh])
      setActiveId(fresh.id)
      return
    }
    setSessions(next)
    if (id === active?.id) setActiveId(next[0].id)
  }

  function retry() {
    if (busy || !active) return
    const idx = messages.map((m) => m.role).lastIndexOf('user')
    if (idx < 0) return
    send(messages[idx].content, messages.slice(0, idx))
  }

  useEffect(() => {
    function onKey(e) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (meta && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        newSession()
      } else if (meta && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      } else if (meta && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setPanelOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const openPanel = (tab) => {
    setPanelTab(tab)
    setPanelOpen(true)
  }

  const actions = [
    { id: 'a1', group: 'Session', icon: 'plus', label: 'New session', hint: 'Start a fresh conversation', keys: '⌘N', run: newSession },
    { id: 'a2', group: 'Session', icon: 'search', label: 'Search sessions', hint: 'Find an earlier conversation', run: () => setSideOpen(true) },
    { id: 'a3', group: 'View', icon: 'panel', label: panelOpen ? 'Hide right panel' : 'Show right panel', hint: 'Changes, files, context', keys: '⌘B', run: () => setPanelOpen((v) => !v) },
    { id: 'a4', group: 'View', icon: 'diff', label: 'Open changes', hint: 'Review the working tree', run: () => openPanel('changes') },
    { id: 'a5', group: 'View', icon: 'layers', label: 'Browse files', hint: 'Project explorer', run: () => openPanel('files') },
    { id: 'a6', group: 'View', icon: 'cpu', label: 'Inspect context', hint: 'Token usage and environment', run: () => openPanel('context') },
    { id: 'a7', group: 'Appearance', icon: theme === 'dark' ? 'sun' : 'moon', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'a8', group: 'Appearance', icon: 'settings', label: 'Open settings', hint: 'Providers, models, approvals', keys: '⌘,', run: () => setSettingsOpen(true) },
    { id: 'a9', group: 'Workspace', icon: 'terminal', label: 'Focus composer', hint: 'Jump to the input', run: () => composerRef.current?.focus() },
  ]

  const isEmpty = messages.length === 0 && !busy
  const noProvider = server && !server.providers.some((p) => p.configured)

  return (
    <div className={'shell' + (panelOpen ? ' with-panel' : '')}>
      <Sidebar
        sessions={sessions}
        activeId={active?.id}
        onSelect={(id) => {
          setActiveId(id)
          setSideOpen(false)
          stickRef.current = true
        }}
        onNew={newSession}
        onDelete={deleteSession}
        open={sideOpen}
        onClose={() => setSideOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        workspace={workspace}
      />

      <main className="main">
        <header className="topbar">
          <button type="button" className="icon-btn only-mobile" onClick={() => setSideOpen(true)} title="Open sessions">
            <Icon name="sidebar" size={17} />
          </button>

          <div className="crumb">
            <span className="crumb-repo">
              <Icon name="git" size={13} />
              {workspace.name}
            </span>
            {workspace.branch && (
              <>
                <Icon name="chevronRight" size={11} className="crumb-sep" />
                <span className="crumb-branch">
                  <Icon name="branch" size={12} />
                  {workspace.branch}
                </span>
              </>
            )}
            <Icon name="chevronRight" size={11} className="crumb-sep" />
            <span className="crumb-title">{active?.title || 'New session'}</span>
          </div>

          <div className="topbar-right">
            <button type="button" className="icon-btn" onClick={() => setPaletteOpen(true)} title="Command palette (⌘K)">
              <Icon name="command" size={16} />
            </button>
            <button
              type="button"
              className={'icon-btn' + (panelOpen ? ' active' : '')}
              onClick={() => setPanelOpen((v) => !v)}
              title="Toggle panel (⌘B)"
            >
              <Icon name="panel" size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings (⌘,)">
              <Icon name="settings" size={16} />
            </button>
          </div>
        </header>

        <div className="thread" ref={scrollRef} onScroll={onScroll}>
          <div className="thread-inner">
            {serverError && (
              <div className="banner error">
                Can't reach the kodo server ({serverError}). Start it with <code>kodo</code> or <code>npm start</code>.
              </div>
            )}
            {isEmpty ? (
              <section className="hero">
                <div className="hero-glow" />
                <div className="hero-mark">
                  <Icon name="logo" size={26} strokeWidth={2.3} />
                </div>
                <h1 className="hero-title">
                  What should we <span className="hero-accent">build</span>?
                </h1>
                <p className="hero-sub">
                  kodo reads your repo, edits files and runs commands with the model you choose — your keys stay on this
                  machine and requests go straight to the provider.
                </p>

                {noProvider ? (
                  <div className="hero-setup">
                    <p>Connect a model provider to get started.</p>
                    <button type="button" className="btn primary" onClick={() => setSettingsOpen(true)}>
                      <Icon name="settings" size={14} />
                      Add API key or sign in
                    </button>
                  </div>
                ) : (
                  <div className="sugg-grid">
                    {suggestions.map((s) => (
                      <button key={s.label} type="button" className="sugg" onClick={() => composerRef.current?.setValue(s.label)}>
                        <span className="sugg-icon">
                          <Icon name={s.icon} size={15} />
                        </span>
                        <span className="sugg-main">
                          <span className="sugg-label">{s.label}</span>
                          <span className="sugg-hint">{s.hint}</span>
                        </span>
                        <Icon name="chevronRight" size={13} className="sugg-chev" />
                      </button>
                    ))}
                  </div>
                )}

                <div className="hero-meta">
                  <span>
                    <Icon name="cpu" size={12} /> {activeModel ? `${activeModel.name} · ${activeModel.providerName}` : 'no model selected'}
                  </span>
                  <span>
                    <Icon name="folder" size={12} /> {workspace.path}
                  </span>
                  <span>
                    <Icon name="bolt" size={12} /> {autoApprove ? 'auto-approve on' : 'asks before edits and commands'}
                  </span>
                </div>
              </section>
            ) : (
              <div className="messages">
                {messages.map((m, i) => (
                  <Message
                    key={m.id}
                    message={m}
                    isLast={i === messages.length - 1}
                    streaming={busy && i === messages.length - 1}
                    onRetry={retry}
                    onDecide={decide}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dock">
          {!atBottom && messages.length > 0 && (
            <button
              type="button"
              className="jump-btn"
              onClick={() => {
                stickRef.current = true
                setAtBottom(true)
                scrollToBottom(true)
              }}
            >
              <Icon name="chevronDown" size={14} />
              Jump to latest
            </button>
          )}
          <Composer
            ref={composerRef}
            onSend={send}
            onStop={stop}
            busy={busy}
            status={STATUS_LABEL[status] || 'Working'}
            model={model}
            models={models}
            modelsLoading={modelsLoading}
            onModel={setModel}
            workspaceName={workspace.name}
            autoApprove={autoApprove}
            onOpenChanges={() => openPanel('changes')}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
      </main>

      <RightPanel
        open={panelOpen}
        tab={panelTab}
        onTab={setPanelTab}
        onClose={() => setPanelOpen(false)}
        rev={rev}
        busy={busy}
        session={active}
        server={server}
        model={activeModel}
        autoApprove={autoApprove}
        onToast={setToast}
        onCommitted={() => setRev((r) => r + 1)}
      />

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onTheme={setTheme}
        model={model}
        models={models}
        modelErrors={modelErrors}
        modelsLoading={modelsLoading}
        onModel={setModel}
        autoApprove={autoApprove}
        onAutoApprove={setAutoApprove}
        server={server}
        onRefresh={refreshAll}
        onToast={setToast}
        onWorkspace={() => {
          refreshState()
          setRev((r) => r + 1)
        }}
      />

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} actions={actions} />}

      {toast && (
        <div className={'toast ' + toast.kind}>
          <Icon name={toast.kind === 'error' ? 'x' : 'check'} size={14} />
          {toast.text}
        </div>
      )}
    </div>
  )
}

function sessions0Id() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]')
    if (Array.isArray(raw) && raw[0]?.id) return raw[0].id
  } catch {
    /* ignore */
  }
  return null
}
