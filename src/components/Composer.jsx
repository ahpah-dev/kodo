import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { formatCtx } from '../lib/workspace'

const MAX_H = 184

const Composer = forwardRef(function Composer(
  { onSend, onStop, busy, status, model, models, modelsLoading, onModel, placeholder, workspaceName, autoApprove, onOpenChanges, onOpenSettings },
  ref,
) {
  const taRef = useRef(null)
  const [value, setValue] = useState('')
  const [scrolling, setScrolling] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')

  const active = models.find((m) => m.id === model)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? models.filter((m) => (m.name + ' ' + m.model + ' ' + m.providerName).toLowerCase().includes(q)) : models
    return list.slice(0, 120)
  }, [models, query])

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
              onClick={() => {
                setModelOpen((v) => !v)
                setQuery('')
              }}
              aria-expanded={modelOpen}
            >
              <span className={'model-dot ' + (active ? 'green' : 'amber')} />
              <span className="model-name">
                {active ? active.name : modelsLoading ? 'Loading models…' : 'Select a model'}
              </span>
              {active && <span className="model-provider">{active.providerName}</span>}
              <Icon name="chevronDown" size={12} className={'model-chev' + (modelOpen ? ' open' : '')} />
            </button>
            {modelOpen && (
              <>
                <div className="popover-backdrop" onClick={() => setModelOpen(false)} />
                <div className="model-menu">
                  {models.length === 0 ? (
                    <div className="model-empty">
                      <p>{modelsLoading ? 'Loading models…' : 'No models yet. Add an API key or sign in to a provider.'}</p>
                      {!modelsLoading && (
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => {
                            setModelOpen(false)
                            onOpenSettings()
                          }}
                        >
                          Open settings
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <input
                        className="model-search"
                        autoFocus
                        placeholder={'Search ' + models.length + ' models…'}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search models"
                      />
                      <div className="model-list">
                        {shown.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={'model-opt' + (m.id === model ? ' selected' : '')}
                            onClick={() => {
                              onModel(m.id)
                              setModelOpen(false)
                            }}
                          >
                            <span className="model-opt-main">
                              <span className="model-opt-name">{m.name}</span>
                              <span className="model-opt-prov">{m.providerName}</span>
                            </span>
                            <span className="model-opt-ctx">{formatCtx(m.ctx)}</span>
                            {m.id === model && <Icon name="check" size={13} />}
                          </button>
                        ))}
                        {shown.length === 0 && <div className="model-none">No models match “{query}”</div>}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="composer-hints">
            <span className="hint-chip">
              <Icon name="folder" size={12} /> {workspaceName}
            </span>
            <span className="hint-chip">
              <Icon name="bolt" size={12} /> {autoApprove ? 'auto-approve on' : 'asks before edits'}
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
            <button type="button" className="composer-icon" title="Review changes" onClick={onOpenChanges}>
              <Icon name="diff" size={15} />
              <span className="composer-icon-label">Changes</span>
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
                disabled={!value.trim() || !model}
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
