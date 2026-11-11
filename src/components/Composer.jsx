import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Icon from './Icon'
import { models } from '../lib/workspace'

const MAX_H = 184

const Composer = forwardRef(function Composer(
  { onSend, onStop, busy, status, model, onModel, placeholder },
  ref,
) {
  const taRef = useRef(null)
  const [value, setValue] = useState('')
  const [scrolling, setScrolling] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [focused, setFocused] = useState(false)

  const active = models.find((m) => m.id === model) || models[0]

  function resize() {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, MAX_H)
    el.style.height = next + 'px'
    setScrolling(next >= MAX_H)
  }

  useEffect(resize, [value])

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setValue: (v) => {
      setValue(v)
      requestAnimationFrame(() => taRef.current?.focus())
    },
    clear: () => setValue(''),
  }))

  function submit() {
    const text = value.trim()
    if (!text || busy) return
    onSend(text)
    setValue('')
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer-wrap">
      <div className={'composer' + (focused ? ' is-focused' : '') + (busy ? ' is-busy' : '')}>
        <div className="composer-top">
          <div className="model-picker">
            <button
              type="button"
              className="model-btn"
              onClick={() => setModelOpen((v) => !v)}
              aria-expanded={modelOpen}
            >
              <span className={'model-dot ' + active.tone} />
              <span className="model-name">{active.name}</span>
              <span className="model-provider">{active.provider}</span>
              <Icon name="chevronDown" size={12} className={'model-chev' + (modelOpen ? ' open' : '')} />
            </button>
            {modelOpen && (
              <>
                <div className="popover-backdrop" onClick={() => setModelOpen(false)} />
                <div className="model-menu">
                  <div className="model-menu-label">Model</div>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={'model-opt' + (m.id === model ? ' selected' : '')}
                      onClick={() => {
                        onModel(m.id)
                        setModelOpen(false)
                      }}
                    >
                      <span className={'model-dot ' + m.tone} />
                      <span className="model-opt-main">
                        <span className="model-opt-name">{m.name}</span>
                        <span className="model-opt-prov">{m.provider}</span>
                      </span>
                      <span className="model-opt-ctx">{m.ctx}</span>
                      {m.id === model && <Icon name="check" size={13} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="composer-hints">
            <span className="hint-chip">
              <Icon name="folder" size={12} /> src
            </span>
            <span className="hint-chip">
              <Icon name="bolt" size={12} /> auto-approve off
            </span>
          </div>
        </div>

        <textarea
          ref={taRef}
          className="composer-input"
          rows={1}
          value={value}
          placeholder={placeholder || 'Ask kodo to build, explain, or fix something…'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ overflowY: scrolling ? 'auto' : 'hidden' }}
          aria-label="Message kodo"
        />

        <div className="composer-bottom">
          <div className="composer-tools">
            <button type="button" className="composer-icon" title="Attach context">
              <Icon name="paperclip" size={15} />
            </button>
            <button type="button" className="composer-icon" title="Plan mode">
              <Icon name="layers" size={15} />
              <span className="composer-icon-label">Plan</span>
            </button>
            <button type="button" className="composer-icon" title="Review changes">
              <Icon name="diff" size={15} />
              <span className="composer-icon-label">Diff</span>
            </button>
          </div>

          <div className="composer-right">
            {busy ? (
              <button type="button" className="send-btn stop" onClick={onStop} title="Stop">
                <Icon name="stop" size={13} strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                onClick={submit}
                disabled={!value.trim()}
                title="Send"
              >
                <Icon name="arrowUp" size={16} strokeWidth={2.1} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="composer-caption">
        <span className={busy ? 'caption-state busy' : 'caption-state'}>
          <span className="caption-dot" />
          {busy ? status : 'Ready'}
        </span>
        <span className="caption-sep">·</span>
        <span>Enter to send</span>
        <span className="caption-sep">·</span>
        <span>Shift+Enter for a new line</span>
      </div>
    </div>
  )
})

export default Composer
