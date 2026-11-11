import { useState } from 'react'
import Icon from './Icon'
import Diff from './Diff'

const ICONS = {
  grep: 'search',
  read: 'file',
  edit: 'edit',
  write: 'write',
  bash: 'terminal',
  glob: 'layers',
  tool: 'layers',
}

function Collapsible({ tool, onDecide }) {
  const [userOpen, setUserOpen] = useState(false)
  const running = tool.status === 'running'
  const pending = tool.status === 'pending'
  const aborted = tool.status === 'aborted'
  const denied = tool.status === 'denied'
  const failed = tool.status === 'error'
  const hasBody = tool.diff || tool.output
  const open = pending || userOpen

  return (
    <div className={'tool' + (open ? ' is-open' : '') + (failed ? ' is-failed' : '')}>
      <button
        type="button"
        className="tool-head"
        onClick={() => hasBody && !pending && setUserOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={'tool-glyph ' + tool.name}>
          <Icon name={ICONS[tool.name] || 'layers'} size={13} strokeWidth={1.8} />
        </span>
        <span className="tool-title">{tool.title}</span>
        {tool.meta && !running && <span className="tool-meta">{tool.meta}</span>}
        {running && (
          <span className="tool-running">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
          </span>
        )}
        {pending && <span className="tool-meta warn">needs approval</span>}
        {aborted && <span className="tool-meta warn">stopped</span>}
        {denied && <span className="tool-meta warn">denied</span>}
        {failed && <span className="tool-meta err">failed</span>}
        {hasBody && !running && !pending && (
          <Icon name="chevronRight" size={13} className={'tool-chev ' + (open ? 'open' : '')} />
        )}
      </button>
      {open && hasBody && (
        <div className="tool-body">
          {tool.diff ? (
            <Diff lines={tool.diff} />
          ) : (
            <pre className="tool-output">
              {tool.output.map((l, i) => (
                <div key={i} className="tool-out-line">
                  {l || ' '}
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
      {pending && (
        <div className="tool-approve">
          <span>{tool.name === 'bash' ? 'Run this command?' : 'Apply this change?'}</span>
          <button type="button" className="btn" onClick={() => onDecide?.(tool.approvalId || tool.id, false)}>
            Deny
          </button>
          <button type="button" className="btn primary" onClick={() => onDecide?.(tool.approvalId || tool.id, true)}>
            Allow
          </button>
        </div>
      )}
    </div>
  )
}

export default function ToolCard(props) {
  return <Collapsible {...props} />
}
