import { useState } from 'react'
import Icon from './Icon'
import Diff from './Diff'
import { changes, files } from '../lib/workspace'

function FileNode({ node, depth, onPick, picked }) {
  const [open, setOpen] = useState(node.kind === 'dir')
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
        {open && node.children?.map((c) => (
          <FileNode
            key={c.path}
            node={c}
            depth={depth + 1}
            onPick={onPick}
            picked={picked}
          />
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

export default function RightPanel({ open, tab, onTab, onClose }) {
  const [picked, setPicked] = useState(changes[0].path)
  const activeChange = changes.find((c) => c.path === picked) || changes[0]

  return (
    <aside className={'rightpanel' + (open ? ' open' : '')}>
      <div className="rp-head">
        <div className="rp-tabs" role="tablist">
          {[
            { id: 'changes', label: 'Changes', icon: 'diff', count: changes.length },
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

      {tab === 'changes' && (
        <div className="rp-body">
          <div className="rp-section-label">Working tree · 3 files</div>
          <div className="change-list">
            {changes.map((c) => (
              <button
                key={c.path}
                type="button"
                className={'change-item' + (c.path === picked ? ' active' : '')}
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
          <div className="rp-diff">
            <div className="rp-diff-head">
              <span className="rp-diff-path">{activeChange.path}</span>
              <span className="rp-diff-stats">
                <span className="add">+{activeChange.adds}</span>
                <span className="add-d">−{activeChange.dels}</span>
              </span>
            </div>
            <Diff lines={activeChange.diff} />
          </div>
          <div className="rp-commit">
            <input className="commit-input" placeholder="Commit message…" aria-label="Commit message" />
            <button type="button" className="commit-btn">
              <Icon name="check" size={14} />
              Commit
            </button>
          </div>
        </div>
      )}

      {tab === 'files' && (
        <div className="rp-body">
          <div className="rp-section-label">Explorer</div>
          <div className="tree">
            {files.map((f) => (
              <FileNode key={f.path} node={f} depth={0} onPick={setPicked} picked={picked} />
            ))}
          </div>
        </div>
      )}

      {tab === 'context' && (
        <div className="rp-body">
          <div className="rp-section-label">Token budget</div>
          <div className="ctx-card">
            <div className="ctx-top">
              <span className="ctx-used">18.4k</span>
              <span className="ctx-total">/ 200k</span>
            </div>
            <div className="ctx-bar">
              <span className="ctx-fill" style={{ width: '9.2%' }} />
            </div>
            <div className="ctx-legend">
              <span><i className="sw system" /> system 2.1k</span>
              <span><i className="sw files" /> files 9.8k</span>
              <span><i className="sw history" /> history 6.5k</span>
            </div>
          </div>

          <div className="rp-section-label">Attached</div>
          <div className="ctx-list">
            {['src/App.jsx', 'src/components/Composer.jsx', 'src/lib/agent.js'].map((p) => (
              <div key={p} className="ctx-item">
                <Icon name="file" size={12} />
                <span>{p}</span>
                <button type="button" className="ctx-x" title="Detach">
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
          </div>

          <div className="rp-section-label">Environment</div>
          <dl className="ctx-meta">
            <div><dt>Runtime</dt><dd>Node 26.5.0</dd></div>
            <div><dt>Package manager</dt><dd>npm 12.2</dd></div>
            <div><dt>Framework</dt><dd>Vite 8 · React 19</dd></div>
            <div><dt>Sandbox</dt><dd className="ok">enabled</dd></div>
            <div><dt>Auto-approve</dt><dd className="warn">off</dd></div>
          </dl>
        </div>
      )}
    </aside>
  )
}
