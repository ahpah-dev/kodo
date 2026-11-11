import { memo, useState } from 'react'
import Icon from './Icon'
import Markdown from '../lib/markdown'
import ToolCard from './ToolCard'

function Reasoning({ part }) {
  const [open, setOpen] = useState(false)
  const streaming = part.status === 'streaming'
  const words = part.text.trim() ? part.text.trim().split(/\s+/).length : 0

  return (
    <div className={'reasoning' + (open ? ' open' : '')}>
      <button type="button" className="reasoning-head" onClick={() => setOpen((v) => !v)}>
        <Icon name="brain" size={14} className={'reasoning-icon' + (streaming ? ' pulse' : '')} />
        <span>{streaming ? 'Thinking' : 'Thought'}</span>
        {!streaming && <span className="reasoning-count">{words} words</span>}
        {streaming && <span className="dots"><i /><i /><i /></span>}
        <Icon name="chevronRight" size={13} className={'reasoning-chev' + (open ? ' open' : '')} />
      </button>
      {open && (
        <div className="reasoning-body">
          {part.text || ' '}
          {streaming && <span className="caret" />}
        </div>
      )}
    </div>
  )
}

function AssistantText({ part }) {
  return (
    <div className="msg-text">
      <Markdown text={part.text} />
      {part.status === 'streaming' && <span className="caret inline" />}
    </div>
  )
}

function MessageInner({ message, isLast, streaming, onRetry, onDecide }) {
  const [copied, setCopied] = useState(false)

  if (message.role === 'user') {
    return (
      <article className="msg msg-user">
        <div className="msg-user-bubble">
          <p>{message.content}</p>
        </div>
        <div className="msg-user-meta">
          <span>{message.time}</span>
        </div>
      </article>
    )
  }

  const parts = message.parts || []
  const plain =
    parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n\n') || ''

  function copy() {
    navigator.clipboard?.writeText(plain).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }

  return (
    <article className="msg msg-assistant">
      <div className="msg-rail">
        <span className="msg-avatar">
          <Icon name="logo" size={14} strokeWidth={2.1} />
        </span>
        <span className="msg-rail-line" />
      </div>

      <div className="msg-body">
        <header className="msg-head">
          <span className="msg-author">kodo</span>
          <span className="msg-model">{message.model}</span>
          <span className="msg-time">{message.time}</span>
        </header>

        {parts.map((part) => {
          if (part.type === 'reasoning') return <Reasoning key={part.id} part={part} />
          if (part.type === 'tool') return <ToolCard key={part.id} tool={part} onDecide={onDecide} />
          if (part.type === 'error') return <div key={part.id} className="msg-error">{part.text}</div>
          if (part.type === 'text') return <AssistantText key={part.id} part={part} />
          return null
        })}

        {streaming && parts.length === 0 && (
          <div className="msg-skeleton">
            <span className="sk-line" style={{ width: '38%' }} />
            <span className="sk-line" style={{ width: '72%' }} />
            <span className="sk-line" style={{ width: '54%' }} />
          </div>
        )}

        {!streaming && (plain || isLast) && (
          <div className="msg-actions">
            <button type="button" onClick={copy} className="ghost-btn" title="Copy response">
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? 'Copied' : 'Copy'}
            </button>
            {isLast && (
              <button type="button" onClick={onRetry} className="ghost-btn" title="Regenerate">
                <Icon name="refresh" size={14} />
                Retry
              </button>
            )}
            <span className="msg-actions-spacer" />
            <span className="msg-foot-note">{message.tokens ? message.tokens + ' tokens' : ''}</span>
          </div>
        )}
      </div>
    </article>
  )
}

export default memo(MessageInner)
