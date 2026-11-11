import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import Composer from './components/Composer'
import Message from './components/Message'
import RightPanel from './components/RightPanel'
import Settings from './components/Settings'
import CommandPalette from './components/CommandPalette'
import Icon from './components/Icon'
import { runAgent, titleFor } from './lib/agent'
import { createInitialSessions, suggestions, workspace, models } from './lib/workspace'

let seq = 0
const uid = (p) => p + '-' + (++seq) + '-' + Date.now().toString(36).slice(-4)
const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const STATUS_LABEL = {
  thinking: 'Thinking',
  working: 'Running tools',
  writing: 'Writing response',
  idle: 'Ready',
}

export default function App() {
  const [sessions, setSessions] = useState(createInitialSessions)
  const [activeId, setActiveId] = useState('s-1')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('idle')
  const [model, setModel] = useState('kodo-pro')
  const [theme, setTheme] = useState(() => localStorage.getItem('kodo.theme') || 'dark')
  const [sideOpen, setSideOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState('changes')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [atBottom, setAtBottom] = useState(true)

  const abortRef = useRef(null)
  const composerRef = useRef(null)
  const scrollRef = useRef(null)
  const stickRef = useRef(true)

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId],
  )
  const messages = useMemo(() => active?.messages || [], [active])
  const activeModel = models.find((m) => m.id === model)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kodo.theme', theme)
  }, [theme])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2600)
      return () => clearTimeout(t)
    }
  }, [toast])

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
    if (force || stickRef.current) {
      el.scrollTop = el.scrollHeight
    }
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

  const send = useCallback(
    async (text) => {
      if (busy) return
      const targetId = activeId
      const sessionId = targetId
      const userMsg = { id: uid('u'), role: 'user', content: text, time: nowTime() }
      const assistantMsg = {
        id: uid('a'),
        role: 'assistant',
        time: nowTime(),
        model: activeModel?.name || 'kodo',
        parts: [],
        tokens: 0,
      }

      patchSession(sessionId, (s) => {
        const isFirst = s.messages.length === 0
        return {
          ...s,
          title: isFirst ? titleFor(text) : s.title,
          updated: 'Just now',
          messages: [...s.messages, userMsg, assistantMsg],
          model,
        }
      })

      stickRef.current = true
      setBusy(true)
      setStatus('thinking')

      const controller = new AbortController()
      abortRef.current = controller

      let reasoningId = null
      const textIds = []
      let tokenCount = 0

      const emit = (evt) => {
        switch (evt.type) {
          case 'status':
            setStatus(evt.status)
            break
          case 'reasoning-start': {
            reasoningId = uid('r')
            patchAssistant(sessionId, assistantMsg.id, (m) => ({
              ...m,
              parts: [...m.parts, { type: 'reasoning', id: reasoningId, text: '', status: 'streaming' }],
            }))
            break
          }
          case 'reasoning-delta':
            patchAssistant(sessionId, assistantMsg.id, (m) => ({
              ...m,
              parts: m.parts.map((p) =>
                p.id === reasoningId ? { ...p, text: p.text + evt.text } : p,
              ),
            }))
            break
          case 'reasoning-end':
            patchAssistant(sessionId, assistantMsg.id, (m) => ({
              ...m,
              parts: m.parts.map((p) =>
                p.id === reasoningId ? { ...p, status: 'done' } : p,
              ),
            }))
            break
          case 'text-start': {
            textIds.push(evt.id)
            patchAssistant(sessionId, assistantMsg.id, (m) => ({
              ...m,
              parts: [...m.parts, { type: 'text', id: evt.id, text: '', status: 'streaming' }],
            }))
            break
          }
          case 'text-delta':
            tokenCount += 1
            patchAssistant(sessionId, assistantMsg.id, (m) => ({
              ...m,
              parts: m.parts.map((p) =>
                p.id === evt.id ? { ...p, text: p.text + evt.text } : p,
              ),
            }))
            break
          case 'text-end':
            patchAssistant(sessionId, assistantMsg.id, (m) => ({
              ...m,
              parts: m.parts.map((p) =>
                p.id === evt.id ? { ...p, status: 'done' } : p,
              ),
            }))
            break
          case 'tool-start':
            patchAssistant(sessionId, assistantMsg.id, (m) => ({
              ...m,
              parts: [...m.parts, { type: 'tool', ...evt.tool }],
            }))
            break
          case 'tool-end':
            patchAssistant(sessionId, assistantMsg.id, (m) => ({
              ...m,
              parts: m.parts.map((p) =>
                p.type === 'tool' && p.id === evt.id ? { ...p, status: evt.status } : p,
              ),
            }))
            break
          case 'done':
            patchAssistant(sessionId, assistantMsg.id, (m) => ({
              ...m,
              tokens: Math.max(140, tokenCount * 3),
            }))
            break
          default:
            break
        }
      }

      try {
        await runAgent({ prompt: text, signal: controller.signal, emit })
      } catch {
        setToast({ kind: 'error', text: 'Agent stopped unexpectedly.' })
      } finally {
        abortRef.current = null
        setBusy(false)
        setStatus('idle')
        patchSession(sessionId, (s) => ({ ...s, tokens: s.tokens + tokenCount * 3 }))
      }
    },
    [activeId, activeModel, busy, model, patchAssistant, patchSession],
  )

  function stop() {
    abortRef.current?.abort()
  }

  function newSession() {
    abortRef.current?.abort()
    const s = {
      id: uid('s'),
      title: 'New session',
      updated: 'Just now',
      model,
      tokens: 0,
      messageCount: 0,
      messages: [],
    }
    setSessions((prev) => [s, ...prev])
    setActiveId(s.id)
    setSideOpen(false)
    stickRef.current = true
    setToast({ kind: 'info', text: 'Started a new session' })
  }

  function deleteSession(id) {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (id === activeId) setActiveId(next[0]?.id || null)
      return next
    })
  }

  function retry() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser && active) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === active.id
            ? { ...s, messages: s.messages.filter((m) => m.role === 'user') }
            : s,
        ),
      )
      send(lastUser.content)
    }
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

  const actions = [
    { id: 'a1', group: 'Session', icon: 'plus', label: 'New session', hint: 'Start a fresh conversation', keys: '⌘N', run: newSession },
    { id: 'a2', group: 'Session', icon: 'search', label: 'Search sessions', hint: 'Find an earlier conversation', run: () => setSideOpen(true) },
    { id: 'a3', group: 'View', icon: 'panel', label: panelOpen ? 'Hide right panel' : 'Show right panel', hint: 'Changes, files, context', keys: '⌘B', run: () => setPanelOpen((v) => !v) },
    { id: 'a4', group: 'View', icon: 'diff', label: 'Open changes', hint: 'Review the working tree', run: () => { setPanelTab('changes'); setPanelOpen(true) } },
    { id: 'a5', group: 'View', icon: 'layers', label: 'Browse files', hint: 'Project explorer', run: () => { setPanelTab('files'); setPanelOpen(true) } },
    { id: 'a6', group: 'View', icon: 'cpu', label: 'Inspect context', hint: 'Token budget and attachments', run: () => { setPanelTab('context'); setPanelOpen(true) } },
    { id: 'a7', group: 'Appearance', icon: theme === 'dark' ? 'sun' : 'moon', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'a8', group: 'Appearance', icon: 'settings', label: 'Open settings', hint: 'Model, theme, privacy', keys: '⌘,', run: () => setSettingsOpen(true) },
    { id: 'a9', group: 'Workspace', icon: 'terminal', label: 'Focus composer', hint: 'Jump to the input', run: () => composerRef.current?.focus() },
  ]

  const isEmpty = messages.length === 0 && !busy

  return (
    <div className={'shell' + (panelOpen ? ' with-panel' : '')}>
      <Sidebar
        sessions={sessions}
        activeId={activeId}
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
      />

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn only-mobile"
            onClick={() => setSideOpen(true)}
            title="Open sessions"
          >
            <Icon name="sidebar" size={17} />
          </button>

          <div className="crumb">
            <span className="crumb-repo">
              <Icon name="git" size={13} />
              {workspace.name}
            </span>
            <Icon name="chevronRight" size={11} className="crumb-sep" />
            <span className="crumb-branch">
              <Icon name="branch" size={12} />
              {workspace.branch}
            </span>
            <Icon name="chevronRight" size={11} className="crumb-sep" />
            <span className="crumb-title">{active?.title || 'New session'}</span>
          </div>

          <div className="topbar-right">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setPaletteOpen(true)}
              title="Command palette (⌘K)"
            >
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
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Toggle theme"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
            <div className="topbar-sep" />
            <div className="user">
              <span className="user-av">DV</span>
              <span className="user-name">david</span>
            </div>
          </div>
        </header>

        <div className="thread" ref={scrollRef} onScroll={onScroll}>
          <div className="thread-inner">
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
                  kodo reads your repo, edits files, runs commands, and checks its own work —
                  all locally, in {workspace.name}.
                </p>

                <div className="sugg-grid">
                  {suggestions.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      className="sugg"
                      onClick={() => {
                        composerRef.current?.setValue(s.label)
                      }}
                    >
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

                <div className="hero-meta">
                  <span><Icon name="cpu" size={12} /> {activeModel?.name}</span>
                  <span><Icon name="folder" size={12} /> {workspace.path}</span>
                  <span><Icon name="bolt" size={12} /> sandboxed</span>
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
            onModel={setModel}
          />
        </div>
      </main>

      <RightPanel
        open={panelOpen}
        tab={panelTab}
        onTab={setPanelTab}
        onClose={() => setPanelOpen(false)}
      />

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onTheme={setTheme}
        model={model}
        onModel={setModel}
      />

      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} actions={actions} />
      )}

      {toast && (
        <div className={'toast ' + toast.kind}>
          <Icon name={toast.kind === 'error' ? 'x' : 'check'} size={14} />
          {toast.text}
        </div>
      )}
    </div>
  )
}
