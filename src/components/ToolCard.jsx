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

function Collapsible({ tool }) {
  const [open, setOpen] = useState(false)
  const running = tool.status === 'running'
  const aborted = tool.status === 'aborted'
  const hasBody = tool.diff || tool.output

  return (
    <div className={'tool' + (open ? ' is-open' : '')}>
      <button
        type="button"
        className="tool-head"
        onClick={() => hasBody && setOpen((v) => !v)}
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
        {aborted && <span className="tool-meta warn">stopped</span>}
        {hasBody && !running && (
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
    </div>
  )
}

export default function ToolCard(props) {
  return <Collapsible {...props} />
}
