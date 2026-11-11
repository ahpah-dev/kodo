import { useMemo, useState } from 'react'
import Icon from './Icon'

function timeGroup(label, sessions, activeId, onSelect, onDelete) {
  if (!sessions.length) return null
  return (
    <div className="nav-group" key={label}>
      <div className="nav-group-label">{label}</div>
      {sessions.map((s) => (
        <div
          key={s.id}
          className={'nav-item' + (s.id === activeId ? ' active' : '')}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(s.id)}
          onKeyDown={(e) => e.key === 'Enter' && onSelect(s.id)}
        >
          <span className="nav-item-text">{s.title || 'Untitled'}</span>
          <button
            type="button"
            className="nav-item-del"
            title="Delete session"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(s.id)
            }}
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

export default function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  open,
  onClose,
  onOpenSettings,
  workspace,
}) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) => (s.title || '').toLowerCase().includes(q))
  }, [sessions, query])

  const groups = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0)
    const sorted = [...filtered].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    return {
      now: sorted.filter((s) => (s.updatedAt || 0) >= startOfToday),
      week: sorted.filter((s) => (s.updatedAt || 0) < startOfToday && (s.updatedAt || 0) >= startOfToday - 6 * 864e5),
      older: sorted.filter((s) => (s.updatedAt || 0) < startOfToday - 6 * 864e5),
    }
  }, [filtered])

  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'sidebar' + (open ? ' open' : '') + (collapsed ? ' collapsed' : '')}>
        <div className="side-top">
          <div className="brand">
            <span className="brand-mark">
              <Icon name="logo" size={16} strokeWidth={2.2} />
            </span>
            <span className="brand-name">kodo</span>
            <span className="brand-badge">local</span>
          </div>
          <button type="button" className="icon-btn side-close" onClick={onClose} title="Close">
            <Icon name="x" size={15} />
          </button>
        </div>

        <button type="button" className="new-btn" onClick={onNew}>
          <Icon name="plus" size={15} strokeWidth={2} />
          <span>New session</span>
          <kbd>⌘N</kbd>
        </button>

        <div className="side-search">
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions"
            aria-label="Search sessions"
          />
          {query && (
            <button type="button" className="side-search-clear" onClick={() => setQuery('')}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>

        <nav className="side-nav">
          {filtered.length === 0 && (
            <div className="side-empty">
              <Icon name="search" size={18} />
              <p>No sessions match “{query}”</p>
            </div>
          )}
          {!query && timeGroup('Today', groups.now, activeId, onSelect, onDelete)}
          {!query && timeGroup('Last 7 days', groups.week, activeId, onSelect, onDelete)}
          {!query && timeGroup('Earlier', groups.older, activeId, onSelect, onDelete)}
          {!!query && timeGroup('Results', filtered, activeId, onSelect, onDelete)}
        </nav>

        <div className="side-foot">
          <div className="repo-card">
            <div className="repo-row">
              <Icon name="git" size={14} />
              <span className="repo-name">{workspace.name}</span>
              {workspace.branch && <span className="repo-branch">{workspace.branch}</span>}
            </div>
            <div className="repo-meta">
              <span className="repo-path">{workspace.path}</span>
              {workspace.ahead > 0 && <span className="repo-ahead">↑{workspace.ahead}</span>}
            </div>
          </div>
          <button type="button" className="side-settings" onClick={onOpenSettings}>
            <Icon name="settings" size={15} />
            <span>Settings</span>
            <kbd>⌘,</kbd>
          </button>
        </div>
        <button
          type="button"
          className="side-collapse"
          onClick={() => setCollapsed((v) => !v)}
          title="Collapse"
        >
          <Icon name="chevronLeft" size={14} />
        </button>
      </aside>
    </>
  )
}
