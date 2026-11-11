import { useEffect, useState } from 'react'
import Icon from './Icon'
import { api } from '../lib/api'

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

const SOURCE_LABEL = { key: 'API key', oauth: 'Signed in', env: 'Environment variable', none: '' }

function ProviderCard({ p, onChanged, onToast, error }) {
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(p.baseUrl)
  const [busy, setBusy] = useState(false)
  const needsBase = p.noKey || p.custom

  async function run(fn, okText) {
    setBusy(true)
    try {
      await fn()
      if (okText) onToast({ kind: 'check', text: okText })
      onChanged()
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const patch = {}
      if (key.trim()) patch.apiKey = key.trim()
      if (needsBase && baseUrl.trim() !== p.baseUrl) patch.baseUrl = baseUrl.trim()
      await api.saveProvider(p.id, patch)
      setKey('')
    }, p.noKey && !key.trim() ? p.name + ' enabled' : p.name + ' saved')

  async function signIn() {
    setBusy(true)
    try {
      const { url } = await api.oauthStart(p.id)
      const win = window.open(url, 'kodo-oauth', 'width=520,height=740')
      if (!win) window.location.href = url
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const status = p.configured
    ? `${p.noKey && p.source === 'none' ? 'Enabled' : SOURCE_LABEL[p.source] || 'Connected'}${p.keyHint ? ' · ' + p.keyHint : ''}`
    : 'Not set up'

  return (
    <div className={'prov' + (p.configured ? ' on' : '')}>
      <div className="prov-head">
        <span className={'prov-dot' + (p.configured ? ' on' : '')} />
        <span className="prov-name">{p.name}</span>
        <span className="prov-status">{status}</span>
        {(p.configured || p.custom) && (
          <button
            type="button"
            className="btn ghost sm"
            disabled={busy}
            onClick={() => run(() => api.removeProvider(p.id), p.name + ' removed')}
          >
            {p.custom ? 'Delete' : 'Remove'}
          </button>
        )}
      </div>

      {error && <div className="prov-error">{error}</div>}

      <div className="prov-body">
        {!p.noKey && (
          <div className="prov-line">
            <input
              className="input"
              type="password"
              autoComplete="off"
              spellCheck="false"
              placeholder={p.configured ? 'Replace API key…' : 'Paste API key'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && key.trim() && save()}
              aria-label={p.name + ' API key'}
            />
            <button type="button" className="btn primary" disabled={busy || (!key.trim() && !(needsBase && baseUrl.trim() !== p.baseUrl))} onClick={save}>
              Save
            </button>
          </div>
        )}

        {needsBase && (
          <div className="prov-line">
            <input
              className="input mono"
              placeholder="Base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              aria-label={p.name + ' base URL'}
            />
            {p.noKey && (
              <button type="button" className="btn primary" disabled={busy} onClick={save}>
                {p.configured ? 'Save' : 'Enable'}
              </button>
            )}
          </div>
        )}

        <div className="prov-links">
          {p.oauth && (
            <button type="button" className="btn" disabled={busy} onClick={signIn}>
              <Icon name="bolt" size={13} />
              {p.oauthConnected ? 'Sign in again' : 'Sign in with ' + (p.oauth === 'openrouter' ? 'OpenRouter' : 'OAuth')}
            </button>
          )}
          {p.keyUrl && (
            <a className="prov-link" href={p.keyUrl} target="_blank" rel="noreferrer">
              Get an API key ↗
            </a>
          )}
          {p.source === 'env' && <span className="prov-hint">Using a key from your environment.</span>}
        </div>
      </div>
    </div>
  )
}

function CustomForm({ redirectUri, onDone, onToast }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', kind: 'openai', baseUrl: '', apiKey: '', auth: 'key', authUrl: '', tokenUrl: '', clientId: '', clientSecret: '', scopes: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }))

  async function submit() {
    setBusy(true)
    try {
      await api.addProvider({
        name: f.name,
        kind: f.kind,
        baseUrl: f.baseUrl,
        apiKey: f.auth === 'key' ? f.apiKey : '',
        oauthConfig:
          f.auth === 'oauth'
            ? { authUrl: f.authUrl, tokenUrl: f.tokenUrl, clientId: f.clientId, clientSecret: f.clientSecret || undefined, scopes: f.scopes || undefined }
            : undefined,
      })
      onToast({ kind: 'check', text: f.name + ' added' })
      setOpen(false)
      setF((v) => ({ ...v, name: '', baseUrl: '', apiKey: '', authUrl: '', tokenUrl: '', clientId: '', clientSecret: '', scopes: '' }))
      onDone()
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn add-prov" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        Add a custom provider
      </button>
    )
  }

  return (
    <div className="prov custom-form">
      <div className="prov-head">
        <span className="prov-name">Custom provider</span>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="prov-body">
        <div className="prov-line">
          <input className="input" placeholder="Name (e.g. Groq, LM Studio)" value={f.name} onChange={set('name')} aria-label="Provider name" />
          <select className="select" value={f.kind} onChange={set('kind')} aria-label="API format">
            <option value="openai">OpenAI-compatible</option>
            <option value="anthropic">Anthropic-compatible</option>
          </select>
        </div>
        <input
          className="input mono"
          placeholder={f.kind === 'anthropic' ? 'Base URL (e.g. https://api.example.com)' : 'Base URL (e.g. https://api.groq.com/openai/v1)'}
          value={f.baseUrl}
          onChange={set('baseUrl')}
          aria-label="Base URL"
        />
        <div className="seg">
          {[
            { id: 'key', label: 'API key' },
            { id: 'oauth', label: 'OAuth 2.0 (PKCE)' },
          ].map((a) => (
            <button key={a.id} type="button" className={'seg-btn' + (f.auth === a.id ? ' active' : '')} onClick={() => setF((v) => ({ ...v, auth: a.id }))}>
              {a.label}
            </button>
          ))}
        </div>
        {f.auth === 'key' ? (
          <input className="input" type="password" autoComplete="off" placeholder="API key (optional for local servers)" value={f.apiKey} onChange={set('apiKey')} aria-label="API key" />
        ) : (
          <>
            <input className="input mono" placeholder="Authorization URL" value={f.authUrl} onChange={set('authUrl')} aria-label="Authorization URL" />
            <input className="input mono" placeholder="Token URL" value={f.tokenUrl} onChange={set('tokenUrl')} aria-label="Token URL" />
            <div className="prov-line">
              <input className="input" placeholder="Client ID" value={f.clientId} onChange={set('clientId')} aria-label="Client ID" />
              <input className="input" type="password" placeholder="Client secret (optional)" value={f.clientSecret} onChange={set('clientSecret')} aria-label="Client secret" />
            </div>
            <input className="input" placeholder="Scopes (space separated, optional)" value={f.scopes} onChange={set('scopes')} aria-label="Scopes" />
            <div className="prov-hint">
              Register this redirect URI with your OAuth app: <code>{redirectUri}</code>
            </div>
          </>
        )}
        <div className="prov-line end">
          <button type="button" className="btn primary" disabled={busy || !f.name.trim() || !f.baseUrl.trim()} onClick={submit}>
            Add provider
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Settings({
  open,
  onClose,
  theme,
  onTheme,
  model,
  models,
  modelErrors,
  modelsLoading,
  onModel,
  autoApprove,
  onAutoApprove,
  server,
  onRefresh,
  onToast,
  onOpenFolder,
}) {
  const [tab, setTab] = useState('providers')

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    function onMessage(e) {
      if (e.origin === window.location.origin && e.data?.kodo === 'oauth') {
        onRefresh(true)
        onToast(e.data.ok ? { kind: 'check', text: 'Signed in' } : { kind: 'error', text: 'Sign-in failed' })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onRefresh, onToast])

  if (!open) return null

  const providers = server?.providers || []
  const redirectUri = window.location.origin + '/oauth/callback'

  const TABS = [
    { id: 'providers', label: 'Providers', icon: 'bolt', note: providers.filter((p) => p.configured).length || '' },
    { id: 'agent', label: 'Agent', icon: 'cpu' },
    { id: 'appearance', label: 'Appearance', icon: 'sun' },
    { id: 'about', label: 'About', icon: 'logo' },
  ]

  return (
    <div className="set-scrim" onMouseDown={onClose}>
      <div className="settings" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Settings">
        <nav className="set-nav">
          <div className="set-nav-title">Settings</div>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={'set-tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={14} />
              <span>{t.label}</span>
              {t.note ? <span className="set-tab-note">{t.note}</span> : null}
            </button>
          ))}
        </nav>

        <div className="set-pane">
          <header className="set-head">
            <div>
              <h2>{TABS.find((t) => t.id === tab).label}</h2>
              <p>
                {tab === 'providers' && 'Keys stay on this machine and are only sent to the provider you choose.'}
                {tab === 'agent' && 'Model, permissions and the project kodo works in.'}
                {tab === 'appearance' && 'How kodo looks.'}
                {tab === 'about' && 'Version and storage.'}
              </p>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} title="Close settings">
              <Icon name="x" size={16} />
            </button>
          </header>

          <div className="set-body">
            {tab === 'providers' && (
              <section className="set-section">
                <div className="prov-list">
                  {providers.map((p) => (
                    <ProviderCard key={p.id + p.baseUrl + p.configured} p={p} onChanged={() => onRefresh(true)} onToast={onToast} error={modelErrors?.[p.id]} />
                  ))}
                  <CustomForm redirectUri={redirectUri} onDone={() => onRefresh(true)} onToast={onToast} />
                </div>
              </section>
            )}

            {tab === 'agent' && (
              <section className="set-section">
                <Row title="Default model" desc={modelsLoading ? 'Loading models…' : models.length + ' available from your providers.'}>
                  <select className="select" value={model} onChange={(e) => onModel(e.target.value)} aria-label="Default model" disabled={!models.length}>
                    {!models.some((m) => m.id === model) && <option value={model}>{model || 'No models available'}</option>}
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.providerName}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row title="Auto-approve edits and commands" desc="Off: kodo asks before writing files or running shell commands. Reads always run.">
                  <Toggle on={autoApprove} onChange={onAutoApprove} label="Auto-approve tools" />
                </Row>
                <Row title="Workspace folder" desc={server?.workspace.path || ''}>
                  <button type="button" className="btn" onClick={onOpenFolder}>
                    <Icon name="folder" size={13} />
                    Change…
                  </button>
                </Row>
              </section>
            )}

            {tab === 'appearance' && (
              <section className="set-section">
                <Row title="Theme" desc="Match your terminal or go light.">
                  <div className="seg">
                    {[
                      { id: 'dark', label: 'Dark', icon: 'moon' },
                      { id: 'light', label: 'Light', icon: 'sun' },
                    ].map((t) => (
                      <button key={t.id} type="button" className={'seg-btn' + (theme === t.id ? ' active' : '')} onClick={() => onTheme(t.id)}>
                        <Icon name={t.icon} size={13} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Row>
              </section>
            )}

            {tab === 'about' && (
              <section className="set-section">
                <Row title="kodo" desc="A lightweight, local-first coding agent.">
                  <span className="set-badge">v{server?.version || '—'}</span>
                </Row>
                <Row title="Credentials file" desc={server?.configPath || ''} />
                <Row title="Runtime" desc={'Node ' + (server?.node || '').replace(/^v/, '') + ' · ' + (server?.platform || '')} />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
