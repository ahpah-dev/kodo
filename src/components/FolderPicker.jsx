import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { api } from '../lib/api'

function Place({ icon = 'folder', label, sub, active, onClick }) {
  return (
    <button type="button" className={'fp-place' + (active ? ' active' : '')} onClick={onClick} title={sub || label}>
      <Icon name={icon} size={14} />
      <span className="fp-place-text">
        <span className="fp-place-name">{label}</span>
        {sub && <span className="fp-place-sub">{sub}</span>}
      </span>
    </button>
  )
}

export default function FolderPicker({ open, onClose, current, recents, onPick }) {
  const [data, setData] = useState(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const listRef = useRef(null)

  async function go(path) {
    setLoading(true)
    try {
      const d = await api.browse(path)
      setData(d)
      setInput(d.path)
      setError('')
      setFilter('')
      listRef.current?.scrollTo({ top: 0 })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    go(current)
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const entries = (data?.entries || []).filter((e) => e.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const others = (recents || []).filter((r) => r.path !== current).slice(0, 6)

  return (
    <div className="set-scrim" onMouseDown={onClose}>
      <div className="fp" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Open folder">
        <header className="fp-head">
          <div>
            <h2>Open folder</h2>
            <p>Choose the project kodo can read and edit.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="fp-main">
          <nav className="fp-side">
            {others.length > 0 && (
              <>
                <div className="fp-label">Recent</div>
                {others.map((r) => (
                  <Place key={r.path} label={r.name} sub={r.path} onClick={() => go(r.path)} active={data?.path === r.path} />
                ))}
              </>
            )}
            <div className="fp-label">Places</div>
            {(data?.places || []).map((p) => (
              <Place key={p.path} icon={p.name === 'Home' ? 'git' : 'folder'} label={p.name} onClick={() => go(p.path)} active={data?.path === p.path} />
            ))}
            {(data?.roots?.length || 0) > 1 && (
              <>
                <div className="fp-label">Drives</div>
                <div className="fp-drives">
                  {data.roots.map((r) => (
                    <button key={r.path} type="button" className={'fp-drive' + (data.path.startsWith(r.path) ? ' active' : '')} onClick={() => go(r.path)}>
                      {r.name.replace(/\\$/, '')}
                    </button>
                  ))}
                </div>
              </>
            )}
          </nav>

          <section className="fp-browser">
            <form
              className="fp-bar"
              onSubmit={(e) => {
                e.preventDefault()
                go(input)
              }}
            >
              <button type="button" className="icon-btn" disabled={!data?.parent} onClick={() => go(data.parent)} title="Up one level">
                <Icon name="arrowUp" size={15} />
              </button>
              <input
                className="input mono"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck="false"
                aria-label="Folder path"
                placeholder="Type or paste a path, then press Enter"
              />
              <button type="submit" className="btn" disabled={loading || !input.trim()}>
                Go
              </button>
            </form>

            {error && <div className="prov-error fp-error">{error}</div>}

            <div className="fp-filter">
              <Icon name="search" size={13} />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter folders" aria-label="Filter folders" />
            </div>

            <div className="fp-list" ref={listRef}>
              {entries.map((e) => (
                <button key={e.path} type="button" className="fp-row" onDoubleClick={() => go(e.path)} onClick={() => go(e.path)}>
                  <Icon name={e.git ? 'git' : 'folder'} size={14} className={e.git ? 'fp-git' : 'fp-dir'} />
                  <span className="fp-row-name">{e.name}</span>
                  {e.git && <span className="fp-tag">git</span>}
                  <Icon name="chevronRight" size={12} className="fp-chev" />
                </button>
              ))}
              {data && entries.length === 0 && !loading && (
                <div className="fp-empty">{filter ? `No folders match “${filter}”.` : 'No subfolders here.'}</div>
              )}
            </div>
          </section>
        </div>

        <footer className="fp-foot">
          <div className="fp-selected">
            <Icon name={data?.git ? 'git' : 'folder'} size={14} />
            <span title={data?.path}>{data?.path || '…'}</span>
            {data?.git && <span className="fp-tag">git repo</span>}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!data || loading} onClick={() => onPick(data.path)}>
            Open this folder
          </button>
        </footer>
      </div>
    </div>
  )
}
