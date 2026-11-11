import { useEffect, useState } from 'react'
import Icon from './Icon'
import { models } from '../lib/workspace'

function Row({ title, desc, children }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-title">{title}</div>
        {desc && <div className="set-row-desc">{desc}</div>}
      </div>
      <div className="set-row-ctl">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={'toggle' + (on ? ' on' : '')}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-knob" />
    </button>
  )
}

export default function Settings({ open, onClose, theme, onTheme, model, onModel }) {
  const [autoApprove, setAutoApprove] = useState(false)
  const [telemetry, setTelemetry] = useState(false)
  const [sounds, setSounds] = useState(true)
  const [wrap, setWrap] = useState(true)
  const [fontSize, setFontSize] = useState(14)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="set-scrim" onMouseDown={onClose}>
      <div className="settings" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="set-head">
          <div>
            <h2>Settings</h2>
            <p>Local-first. Nothing leaves this machine.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close settings">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="set-body">
          <section className="set-section">
            <h3 className="set-h3">Appearance</h3>
            <Row title="Theme" desc="Match your terminal or go light.">
              <div className="seg">
                {[
                  { id: 'dark', label: 'Dark', icon: 'moon' },
                  { id: 'light', label: 'Light', icon: 'sun' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={'seg-btn' + (theme === t.id ? ' active' : '')}
                    onClick={() => onTheme(t.id)}
                  >
                    <Icon name={t.icon} size={13} />
                    {t.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row title="Font size" desc="Affects chat and code blocks.">
              <div className="stepper">
                <button type="button" onClick={() => setFontSize((v) => Math.max(12, v - 1))}>−</button>
                <span>{fontSize}px</span>
                <button type="button" onClick={() => setFontSize((v) => Math.min(19, v + 1))}>+</button>
              </div>
            </Row>
            <Row title="Soft wrap code" desc="Wrap long lines instead of scrolling.">
              <Toggle on={wrap} onChange={setWrap} label="Soft wrap code" />
            </Row>
          </section>

          <section className="set-section">
            <h3 className="set-h3">Agent</h3>
            <Row title="Default model" desc="Used for new sessions.">
              <select
                className="select"
                value={model}
                onChange={(e) => onModel(e.target.value)}
                aria-label="Default model"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.provider}
                  </option>
                ))}
              </select>
            </Row>
            <Row title="Auto-approve tools" desc="Run edits and commands without asking.">
              <Toggle on={autoApprove} onChange={setAutoApprove} label="Auto-approve tools" />
            </Row>
            <Row title="Completion sound" desc="A soft chime when a run finishes.">
              <Toggle on={sounds} onChange={setSounds} label="Completion sound" />
            </Row>
          </section>

          <section className="set-section">
            <h3 className="set-h3">Privacy</h3>
            <Row title="Anonymous telemetry" desc="Off by default. No prompts, no code.">
              <Toggle on={telemetry} onChange={setTelemetry} label="Anonymous telemetry" />
            </Row>
          </section>

          <section className="set-section">
            <h3 className="set-h3">About</h3>
            <Row title="kodo" desc="A lightweight coding agent UI.">
              <span className="set-badge">v0.1.0 · local</span>
            </Row>
          </section>
        </div>
      </div>
    </div>
  )
}
