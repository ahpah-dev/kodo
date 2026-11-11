import { useEffect, useState } from 'react'
import Icon from './Icon'
import Diff from './Diff'
import { api } from '../lib/api'
import { formatCtx, formatTokens } from '../lib/workspace'

function FileNode({ node, depth, onPick, picked }) {
  const [open, setOpen] = useState(depth === 0)
  const isDir = node.kind === 'dir'

  if (isDir) {
    return (
      <div className="tree-node">
        <button
          type="button"
          className="tree-row dir"
          style={{ paddingLeft: 8 + depth * 13 }}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="chevronRight" size={11} className={'tree-chev' + (open ? ' open' : '')} />
          <Icon name="folder" size={13} className="tree-icon dir" />
          <span className="tree-name">{node.path.split('/').pop()}</span>
        </button>
        {open &&
          node.children?.map((c) => (
            <FileNode key={c.path} node={c} depth={depth + 1} onPick={onPick} picked={picked} />
          ))}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={'tree-row file' + (picked === node.path ? ' picked' : '')}
      style={{ paddingLeft: 22 + depth * 13 }}
      onClick={() => onPick(node.path)}
    >
      <Icon name="file" size={12} className="tree-icon" />
      <span className="tree-name">{node.path.split('/').pop()}</span>
      {node.status && <span className={'tree-status s-' + node.status}>{node.status}</span>}
    </button>
  )
}

export default function RightPanel({
  open,
  tab,
  onTab,
  onClose,
  rev,
  busy,
  session,
  server,
  model,
  autoApprove,
  onToast,
  onCommitted,
}) {
  const [changes, setChanges] = useState({ git: true, files: [] })
  const [files, setFiles] = useState([])
  const [picked, setPicked] = useState(null)
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let live = true
    api
      .changes()
      .then((c) => {
        if (live) {
          setChanges(c)
          setError('')
        }
      })
      .catch((e) => live && setError(e.message))
    if (tab === 'files') {
      api
        .files()
        .then((f) => live && setFiles(f.files))
        .catch((e) => live && setError(e.message))
    }
    return () => {
      live = false
    }
  }, [open, tab, rev, busy])

  const list = changes.files
  const activeChange = list.find((c) => c.path === picked) || list[0]

  async function commit() {
    setCommitting(true)
    try {
      await api.commit(message)
      setMessage('')
      onToast({ kind: 'check', text: 'Committed' })
      onCommitted()
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    } finally {
      setCommitting(false)
    }
  }

  function pickFile(p) {
    setPicked(p)
    if (list.some((c) => c.path === p)) onTab('changes')
  }

  const used = session?.lastInput || 0
  const total = model?.ctx || 0

  return (
    <aside className={'rightpanel' + (open ? ' open' : '')}>
      <div className="rp-head">
        <div className="rp-tabs" role="tablist">
          {[
            { id: 'changes', label: 'Changes', icon: 'diff', count: list.length },
            { id: 'files', label: 'Files', icon: 'layers' },
            { id: 'context', label: 'Context', icon: 'cpu' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={'rp-tab' + (tab === t.id ? ' active' : '')}
              onClick={() => onTab(t.id)}
            >
              <Icon name={t.icon} size={13} />
              <span>{t.label}</span>
              {t.count ? <span className="rp-tab-count">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn rp-close" onClick={onClose} title="Hide panel">
          <Icon name="x" size={14} />
        </button>
      </div>

      {error && <div className="rp-note err">{error}</div>}

      {tab === 'changes' && (
        <div className="rp-body">
          {!changes.git ? (
            <div className="rp-empty">This folder is not a git repository, so there is no working tree to show.</div>
          ) : list.length === 0 ? (
            <div className="rp-empty">No uncommitted changes.</div>
          ) : (
            <>
              <div className="rp-section-label">
                Working tree · {list.length} file{list.length === 1 ? '' : 's'}
              </div>
              <div className="change-list">
                {list.map((c) => (
                  <button
                    key={c.path}
                    type="button"
                    className={'change-item' + (c.path === activeChange?.path ? ' active' : '')}
                    onClick={() => setPicked(c.path)}
                  >
                    <Icon name="file" size={12} className="change-icon" />
                    <span className="change-path">{c.path.split('/').pop()}</span>
                    <span className="change-dir">{c.path.split('/').slice(0, -1).join('/')}</span>
                    <span className="change-nums">
                      <span className="add">+{c.adds}</span>
                      <span className="add-d">−{c.dels}</span>
                    </span>
                  </button>
                ))}
              </div>
              {activeChange && (
                <div className="rp-diff">
                  <div className="rp-diff-head">
                    <span className="rp-diff-path">{activeChange.path}</span>
                    <span className="rp-diff-stats">
                      <span className="add">+{activeChange.adds}</span>
                      <span className="add-d">−{activeChange.dels}</span>
                    </span>
                  </div>
                  {activeChange.diff.length ? (
                    <Diff lines={activeChange.diff} />
                  ) : (
                    <div className="rp-empty">{activeChange.note || 'No textual diff.'}</div>
                  )}
                </div>
              )}
              <div className="rp-commit">
                <input
                  className="commit-input"
                  placeholder="Commit message…"
                  aria-label="Commit message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && message.trim() && !committing && commit()}
                />
                <button
                  type="button"
                  className="commit-btn"
                  disabled={!message.trim() || committing}
                  onClick={commit}
                  title="Stage everything and commit"
                >
                  <Icon name="check" size={14} />
                  Commit
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'files' && (
        <div className="rp-body">
          <div className="rp-section-label">Explorer</div>
          <div className="tree">
            {files.length === 0 && <div className="rp-empty">Empty folder.</div>}
            {files.map((f) => (
              <FileNode key={f.path} node={f} depth={0} onPick={pickFile} picked={picked} />
            ))}
          </div>
        </div>
      )}

      {tab === 'context' && (
        <div className="rp-body">
          <div className="rp-section-label">Context window</div>
          <div className="ctx-card">
            <div className="ctx-top">
              <span className="ctx-used">{used ? formatTokens(used) : '—'}</span>
              <span className="ctx-total">{total ? '/ ' + formatCtx(total) : 'tokens in last request'}</span>
            </div>
            {total > 0 && (
              <div className="ctx-bar">
                <span className="ctx-fill" style={{ width: Math.min(100, (used / total) * 100) + '%' }} />
              </div>
            )}
            <div className="ctx-legend">
              <span>session total {formatTokens(session?.tokens || 0)} tokens</span>
            </div>
          </div>

          <div className="rp-section-label">Environment</div>
          <dl className="ctx-meta">
            <div><dt>Model</dt><dd>{model ? model.name : '—'}</dd></div>
            <div><dt>Provider</dt><dd>{model ? model.providerName : '—'}</dd></div>
            <div><dt>Workspace</dt><dd title={server?.workspace.path}>{server?.workspace.name || '—'}</dd></div>
            <div><dt>Platform</dt><dd>{server?.platform || '—'}</dd></div>
            <div><dt>Server runtime</dt><dd>Node {server?.node?.replace(/^v/, '') || '—'}</dd></div>
            <div>
              <dt>Edits &amp; commands</dt>
              <dd className={autoApprove ? 'warn' : 'ok'}>{autoApprove ? 'auto-approved' : 'ask first'}</dd>
            </div>
          </dl>
        </div>
      )}
    </aside>
  )
}
