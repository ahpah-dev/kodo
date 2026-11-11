'use strict'

// Model providers: credential resolution, model listing, OAuth, and streaming adapters.
// Two wire formats cover everything: Anthropic Messages and OpenAI-style Chat Completions
// (OpenAI, Google Gemini's OpenAI-compatible endpoint, OpenRouter, Ollama, any custom gateway).

const crypto = require('node:crypto')
const config = require('./config.cjs')

const PRESETS = {
  anthropic: {
    name: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    env: ['ANTHROPIC_API_KEY'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    env: ['OPENAI_API_KEY'],
    usage: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    exclude: /(embedding|whisper|tts|dall-e|moderation|image|audio|realtime|transcribe|davinci|babbage|search|computer-use)/i,
  },
  google: {
    name: 'Google Gemini',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    keyUrl: 'https://aistudio.google.com/apikey',
    include: /(gemini|gemma)/i,
    exclude: /(embedding|tts|image|live|audio|aqa|imagen|veo)/i,
  },
  openrouter: {
    name: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    env: ['OPENROUTER_API_KEY'],
    usage: true,
    oauth: 'openrouter',
    keyUrl: 'https://openrouter.ai/keys',
  },
  ollama: {
    name: 'Ollama (local)',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    noKey: true,
  },
}

const PROVIDER_ORDER = ['anthropic', 'openai', 'google', 'openrouter', 'ollama']

// ---------------------------------------------------------------- resolution

function envKey(preset) {
  for (const name of preset?.env || []) if (process.env[name]) return process.env[name]
  return ''
}

function describe(id) {
  const stored = config.getProvider(id)
  const preset = PRESETS[id]
  if (!preset && !stored?.custom) return null
  const base = preset || {}
  const kind = stored?.kind || base.kind
  const env = !stored?.apiKey && !stored?.oauth && envKey(preset)
  const token = stored?.oauth?.accessToken || stored?.apiKey || env || ''
  return {
    id,
    name: stored?.name || base.name,
    kind,
    baseUrl: (stored?.baseUrl || base.baseUrl || '').replace(/\/+$/, ''),
    usage: !!base.usage,
    include: base.include,
    exclude: base.exclude,
    custom: !!stored?.custom,
    noKey: !!base.noKey,
    token,
    source: stored?.oauth ? 'oauth' : stored?.apiKey ? (stored.via === 'oauth' ? 'oauth' : 'key') : env ? 'env' : 'none',
    configured: !!token || (!!base.noKey && !!stored) || (!!stored?.custom && !!stored.noAuth),
    oauthKind: base.oauth || (stored?.oauthConfig ? 'custom' : null),
    oauthConfig: stored?.oauthConfig || null,
    keyUrl: base.keyUrl || '',
  }
}

function listProviders() {
  const ids = [...PROVIDER_ORDER]
  for (const [id, p] of Object.entries(config.load().providers)) if (p.custom) ids.push(id)
  return ids.map(describe).filter(Boolean)
}

function publicInfo(p) {
  const stored = config.getProvider(p.id)
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    baseUrl: p.baseUrl,
    custom: p.custom,
    noKey: p.noKey,
    configured: p.configured,
    source: p.source,
    keyHint: p.token ? (p.token.length > 12 ? p.token.slice(0, 4) + '…' + p.token.slice(-4) : '••••') : '',
    oauth: p.oauthKind,
    oauthConnected: !!stored?.oauth || stored?.via === 'oauth',
    keyUrl: p.keyUrl,
  }
}

function authHeaders(p) {
  if (!p.token) return {}
  if (p.kind === 'anthropic') {
    return p.source === 'oauth'
      ? { authorization: 'Bearer ' + p.token }
      : { 'x-api-key': p.token }
  }
  return { authorization: 'Bearer ' + p.token }
}

async function ensureFresh(id) {
  const stored = config.getProvider(id)
  const o = stored?.oauth
  if (o?.refreshToken && o.expiresAt && Date.now() > o.expiresAt - 60_000) {
    const cfg = stored.oauthConfig
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: o.refreshToken,
      client_id: cfg.clientId,
    })
    if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret)
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.access_token) {
      throw new Error(`OAuth token refresh failed for ${stored.name || id}. Reconnect it in Settings.`)
    }
    config.setProvider(id, {
      oauth: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || o.refreshToken,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : 0,
      },
    })
  }
  return describe(id)
}

// ---------------------------------------------------------------- http + sse

async function httpError(res, label) {
  let detail = ''
  try {
    const text = await res.text()
    try {
      const j = JSON.parse(text)
      detail = j.error?.message || j.message || (Array.isArray(j) ? j[0]?.error?.message : '') || text
    } catch {
      detail = text
    }
  } catch {
    /* ignore */
  }
  const err = new Error(`${label} ${res.status}${detail ? ': ' + String(detail).slice(0, 600) : ''}`)
  err.status = res.status
  return err
}

async function* sse(res) {
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true })
    let i
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, i)
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '')
      let event = ''
      const data = []
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (data.length) yield { event, data: data.join('\n') }
    }
  }
}

// ---------------------------------------------------------------- models

const modelCache = new Map()

async function listModels(id, { fresh } = {}) {
  const hit = modelCache.get(id)
  if (hit && !fresh && Date.now() - hit.at < 5 * 60_000) return hit.models
  const p = await ensureFresh(id)
  if (!p?.configured) return []

  let models = []
  if (p.kind === 'anthropic') {
    const res = await fetch(p.baseUrl + '/v1/models?limit=1000', {
      headers: { 'anthropic-version': '2023-06-01', ...authHeaders(p) },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw await httpError(res, p.name)
    const j = await res.json()
    models = (j.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id, ctx: m.max_input_tokens || 0 }))
  } else {
    const res = await fetch(p.baseUrl + '/models', {
      headers: authHeaders(p),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw await httpError(res, p.name)
    const j = await res.json()
    models = (j.data || j.models || []).map((m) => {
      const mid = String(m.id || m.name || '').replace(/^models\//, '')
      return { id: mid, name: m.name && id === 'openrouter' ? m.name : mid, ctx: m.context_length || m.inputTokenLimit || 0 }
    })
    if (p.include) models = models.filter((m) => p.include.test(m.id))
    if (p.exclude) models = models.filter((m) => !p.exclude.test(m.id))
  }
  models = models.filter((m) => m.id).sort((a, b) => a.name.localeCompare(b.name))
  modelCache.set(id, { at: Date.now(), models })
  return models
}

function clearModelCache(id) {
  if (id) modelCache.delete(id)
  else modelCache.clear()
}

// ---------------------------------------------------------------- oauth

const pending = new Map()
const b64url = (buf) => buf.toString('base64url')

function startOAuth(id, origin) {
  const p = describe(id)
  if (!p) throw new Error('Unknown provider')
  const verifier = b64url(crypto.randomBytes(48))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const state = b64url(crypto.randomBytes(18))
  const redirectUri = origin + '/oauth/callback'

  for (const [k, v] of pending) if (Date.now() - v.at > 10 * 60_000) pending.delete(k)
  pending.set(state, { id, verifier, redirectUri, at: Date.now() })

  if (p.oauthKind === 'openrouter') {
    const u = new URL('https://openrouter.ai/auth')
    u.searchParams.set('callback_url', redirectUri)
    u.searchParams.set('code_challenge', challenge)
    u.searchParams.set('code_challenge_method', 'S256')
    u.searchParams.set('state', state)
    return u.toString()
  }
  const cfg = p.oauthConfig
  if (!cfg) throw new Error('This provider has no OAuth configuration')
  const u = new URL(cfg.authUrl)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', cfg.clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  if (cfg.scopes) u.searchParams.set('scope', cfg.scopes)
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  return u.toString()
}

async function finishOAuth({ state, code, error, error_description: desc }) {
  const ctx = pending.get(state)
  if (!ctx) throw new Error('Unknown or expired sign-in attempt. Start again from Settings.')
  pending.delete(state)
  if (error) throw new Error(desc || error)
  if (!code) throw new Error('The provider did not return an authorization code.')

  const p = describe(ctx.id)
  if (p.oauthKind === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: ctx.verifier, code_challenge_method: 'S256' }),
    })
    if (!res.ok) throw await httpError(res, 'OpenRouter')
    const j = await res.json()
    if (!j.key) throw new Error('OpenRouter returned no key.')
    config.setProvider(ctx.id, { apiKey: j.key, via: 'oauth' })
  } else {
    const cfg = p.oauthConfig
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ctx.redirectUri,
      client_id: cfg.clientId,
      code_verifier: ctx.verifier,
    })
    if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret)
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    })
    if (!res.ok) throw await httpError(res, 'Token endpoint')
    const j = await res.json()
    if (!j.access_token) throw new Error('The token endpoint returned no access_token.')
    config.setProvider(ctx.id, {
      oauth: {
        accessToken: j.access_token,
        refreshToken: j.refresh_token || '',
        expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : 0,
      },
    })
  }
  clearModelCache(ctx.id)
  return ctx.id
}

// ---------------------------------------------------------------- adapters
//
// Canonical conversation format used by the agent:
//   { role: 'user', content: string }
//   { role: 'assistant', blocks: [{ type: 'text', text } | { type: 'tool_use', id, name, input, extra? }] }
//   { role: 'tool', results: [{ id, content, isError }] }
//
// Adapters stream normalized events:
//   { type: 'text' | 'reasoning', text }
//   { type: 'tool', id, name, input, extra?, parseError? }
//   { type: 'usage', input, output }

function toAnthropicMessages(messages) {
  const out = []
  for (const m of messages) {
    if (m.role === 'user') {
      if (m.content?.trim()) out.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const content = []
      for (const b of m.blocks) {
        if (b.type === 'text' && b.text.trim()) content.push({ type: 'text', text: b.text })
        else if (b.type === 'tool_use') content.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input || {} })
      }
      if (content.length) out.push({ role: 'assistant', content })
    } else if (m.role === 'tool') {
      out.push({
        role: 'user',
        content: m.results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: r.content || '(no output)',
          is_error: !!r.isError,
        })),
      })
    }
  }
  return out
}

async function* streamAnthropic(p, { model, system, messages, tools, signal }) {
  const body = {
    model,
    max_tokens: 8192,
    stream: true,
    system,
    messages: toAnthropicMessages(messages),
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })),
  }
  const res = await fetch(p.baseUrl + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', ...authHeaders(p) },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw await httpError(res, p.name)

  const blocks = new Map()
  let input = 0
  let output = 0
  for await (const { data } of sse(res)) {
    let ev
    try {
      ev = JSON.parse(data)
    } catch {
      continue
    }
    switch (ev.type) {
      case 'message_start': {
        const u = ev.message?.usage || {}
        input = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
        output = u.output_tokens || 0
        break
      }
      case 'content_block_start':
        blocks.set(ev.index, { type: ev.content_block.type, id: ev.content_block.id, name: ev.content_block.name, json: '' })
        break
      case 'content_block_delta': {
        const d = ev.delta
        if (d.type === 'text_delta') yield { type: 'text', text: d.text }
        else if (d.type === 'thinking_delta') yield { type: 'reasoning', text: d.thinking }
        else if (d.type === 'input_json_delta') {
          const b = blocks.get(ev.index)
          if (b) b.json += d.partial_json
        }
        break
      }
      case 'content_block_stop': {
        const b = blocks.get(ev.index)
        if (b?.type === 'tool_use') {
          let parsed = {}
          let parseError
          try {
            parsed = b.json ? JSON.parse(b.json) : {}
          } catch {
            parseError = 'Tool arguments were not valid JSON'
          }
          yield { type: 'tool', id: b.id, name: b.name, input: parsed, parseError }
        }
        blocks.delete(ev.index)
        break
      }
      case 'message_delta':
        output = ev.usage?.output_tokens ?? output
        break
      case 'error':
        throw new Error(`${p.name}: ${ev.error?.message || 'stream error'}`)
      default:
        break
    }
  }
  yield { type: 'usage', input, output }
}

function toOpenAIMessages(system, messages) {
  const out = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') {
      if (m.content?.trim()) out.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const text = m.blocks.filter((b) => b.type === 'text').map((b) => b.text).join('')
      const calls = m.blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
          ...(b.extra ? { extra_content: b.extra } : {}),
        }))
      if (!text.trim() && !calls.length) continue
      const msg = { role: 'assistant', content: text || null }
      if (calls.length) msg.tool_calls = calls
      out.push(msg)
    } else if (m.role === 'tool') {
      for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.id, content: r.content || '(no output)' })
    }
  }
  return out
}

async function* streamOpenAI(p, { model, system, messages, tools, signal }) {
  const body = {
    model,
    stream: true,
    messages: toOpenAIMessages(system, messages),
    tools: tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.schema },
    })),
  }
  if (p.usage) body.stream_options = { include_usage: true }

  const res = await fetch(p.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(p) },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw await httpError(res, p.name)

  const calls = new Map()
  let input = 0
  let output = 0
  for await (const { data } of sse(res)) {
    if (data === '[DONE]') break
    let ev
    try {
      ev = JSON.parse(data)
    } catch {
      continue
    }
    if (ev.error) throw new Error(`${p.name}: ${ev.error.message || JSON.stringify(ev.error)}`)
    if (ev.usage) {
      input = ev.usage.prompt_tokens || input
      output = ev.usage.completion_tokens || output
    }
    const choice = ev.choices?.[0]
    if (!choice) continue
    const d = choice.delta || {}
    const reasoning = d.reasoning_content ?? d.reasoning
    if (typeof reasoning === 'string' && reasoning) yield { type: 'reasoning', text: reasoning }
    if (typeof d.content === 'string' && d.content) yield { type: 'text', text: d.content }
    for (const tc of d.tool_calls || []) {
      const idx = tc.index ?? 0
      let c = calls.get(idx)
      if (!c) {
        c = { id: '', name: '', args: '', extra: undefined }
        calls.set(idx, c)
      }
      if (tc.id) c.id = tc.id
      if (tc.function?.name) c.name += tc.function.name
      if (tc.function?.arguments) c.args += tc.function.arguments
      if (tc.extra_content) c.extra = tc.extra_content
    }
  }
  for (const c of calls.values()) {
    if (!c.name) continue
    let parsed = {}
    let parseError
    try {
      parsed = c.args ? JSON.parse(c.args) : {}
    } catch {
      parseError = 'Tool arguments were not valid JSON'
    }
    yield {
      type: 'tool',
      id: c.id || 'call_' + crypto.randomBytes(6).toString('hex'),
      name: c.name,
      input: parsed,
      extra: c.extra,
      parseError,
    }
  }
  yield { type: 'usage', input, output }
}

function stream(p, opts) {
  return p.kind === 'anthropic' ? streamAnthropic(p, opts) : streamOpenAI(p, opts)
}

// ---------------------------------------------------------------- custom providers

function addCustom({ name, kind, baseUrl, apiKey, oauthConfig }) {
  if (!name?.trim()) throw new Error('Name is required')
  if (!/^https?:\/\//i.test(baseUrl || '')) throw new Error('Base URL must start with http:// or https://')
  if (oauthConfig && (!oauthConfig.authUrl || !oauthConfig.tokenUrl || !oauthConfig.clientId)) {
    throw new Error('OAuth needs an authorization URL, token URL and client ID')
  }
  const id = 'custom-' + crypto.randomBytes(3).toString('hex')
  config.setProvider(id, {
    custom: true,
    name: name.trim(),
    kind: kind === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: baseUrl.trim().replace(/\/+$/, ''),
    apiKey: apiKey?.trim() || undefined,
    noAuth: !apiKey?.trim() && !oauthConfig,
    oauthConfig: oauthConfig || undefined,
  })
  return id
}

module.exports = {
  PRESETS,
  describe,
  listProviders,
  publicInfo,
  ensureFresh,
  listModels,
  clearModelCache,
  startOAuth,
  finishOAuth,
  stream,
  addCustom,
}
