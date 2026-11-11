'use strict'

const http = require('node:http')
const path = require('node:path')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { exec } = require('node:child_process')

const pkg = require('../package.json')
const config = require('./config.cjs')
const providers = require('./providers.cjs')
const agent = require('./agent.cjs')
const workspace = require('./workspace.cjs')

let inSea = false
let getAsset = () => {
  throw new Error('not a sea')
}
try {
  const sea = require('node:sea')
  inSea = sea.isSea()
  getAsset = sea.getAsset
} catch {
  inSea = false
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

if (flag('--help') || flag('-h')) {
  process.stdout.write(
    [
      `kodo ${pkg.version} — local coding agent`,
      '',
      'Usage: kodo [options]',
      '',
      '  --dir <path>  Workspace the agent may read and edit (default: current directory)',
      '  --port <n>    Port to listen on (default 4173)',
      '  --host <h>    Host to bind (default 127.0.0.1)',
      '  --no-open     Do not open the browser',
      '  --api-only    Serve the API without web assets (for `npm run dev`)',
      '  --help        Show this help',
      '',
      'Provider keys: set them in Settings, or via ANTHROPIC_API_KEY, OPENAI_API_KEY,',
      'GEMINI_API_KEY, OPENROUTER_API_KEY. Stored in ' + config.file,
      '',
    ].join('\n'),
  )
  process.exit(0)
}

// ---------------------------------------------------------------- static assets

const distDir = path.join(__dirname, '..', 'dist')
const files = new Map()

function load() {
  if (inSea) {
    for (const key of require('node:sea').getAssetKeys()) {
      files.set('/' + key.replace(/\\/g, '/'), {
        body: Buffer.from(getAsset(key)),
        kind: TYPES[path.extname(key)] || 'application/octet-stream',
      })
    }
    return
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        files.set('/' + path.relative(distDir, full).split(path.sep).join('/'), {
          body: fs.readFileSync(full),
          kind: TYPES[path.extname(full)] || 'application/octet-stream',
        })
      }
    }
  }
  if (fs.existsSync(distDir)) walk(distDir)
}

load()

if (files.size === 0 && !flag('--api-only')) {
  process.stderr.write('kodo: no web assets found. Run `npm run build` first.\n')
  process.exit(1)
}

const index = files.get('/index.html')

// ---------------------------------------------------------------- state + guards

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

const insideRepo = (dir) => {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return true
    if (path.dirname(d) === d) return false
  }
}

// --dir wins; otherwise the current folder, unless that is not a project and a
// previously opened workspace exists (e.g. kodo.exe was double-clicked).
let root = path.resolve(process.cwd())
if (flag('--dir')) {
  root = path.resolve(value('--dir', root))
  if (!isDir(root)) {
    process.stderr.write(`kodo: workspace is not a directory: ${root}\n`)
    process.exit(1)
  }
} else {
  const last = config.load().lastWorkspace
  if (last && isDir(last) && !insideRepo(root) && !fs.existsSync(path.join(root, 'package.json'))) root = last
}

function remember(dir) {
  const cfg = config.load()
  cfg.lastWorkspace = dir
  cfg.recentWorkspaces = [dir, ...(cfg.recentWorkspaces || []).filter((d) => d !== dir)].slice(0, 12)
  config.save()
}
remember(root)

// Folder browser for the "Open folder" dialog.
function browse(target) {
  const home = require('node:os').homedir()
  const dir = path.resolve(target || root)
  if (!isDir(dir)) throw httpErr(400, 'Not a folder: ' + dir)
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    throw httpErr(400, e.code === 'EACCES' || e.code === 'EPERM' ? 'No permission to open ' + dir : e.message)
  }
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$') && e.name !== 'node_modules')
    .map((e) => {
      const full = path.join(dir, e.name)
      return { name: e.name, path: full, git: fs.existsSync(path.join(full, '.git')) }
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const parent = path.dirname(dir) === dir ? null : path.dirname(dir)
  const roots = []
  if (process.platform === 'win32') {
    for (let c = 65; c <= 90; c++) {
      const d = String.fromCharCode(c) + ':\\'
      if (fs.existsSync(d)) roots.push({ name: d, path: d })
    }
  } else roots.push({ name: '/', path: '/' })
  const places = [
    { name: 'Home', path: home },
    ...['Desktop', 'Documents', 'Downloads', 'Projects', 'dev', 'code', 'src', 'repos']
      .map((n) => ({ name: n, path: path.join(home, n) }))
      .filter((p) => isDir(p.path)),
  ]
  return { path: dir, parent, entries: dirs, roots, places, git: fs.existsSync(path.join(dir, '.git')) }
}

const host = value('--host', '127.0.0.1')
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const remote = !LOOPBACK.has(host)
const token = remote ? crypto.randomBytes(24).toString('base64url') : ''

const hostName = (h) => String(h || '').replace(/:\d+$/, '').toLowerCase()

function cookieOk(req) {
  const m = /(?:^|;\s*)kodo_token=([^;]+)/.exec(req.headers.cookie || '')
  return !!m && m[1].length === token.length && crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(token))
}

// Blocks cross-site requests and DNS rebinding: the API can run commands, so it only
// answers requests that were sent by this page on this host.
function guard(req) {
  if (!remote && !LOOPBACK.has(hostName(req.headers.host))) return 'Unexpected Host header'
  const origin = req.headers.origin
  if (origin) {
    let o
    try {
      o = new URL(origin)
    } catch {
      return 'Bad Origin'
    }
    if (o.host !== req.headers.host) return 'Cross-origin request blocked'
  }
  if (remote && !cookieOk(req)) return 'Not authorized'
  return ''
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(payload)
}

function readJson(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('Request too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function oauthPage(ok, message) {
  return `<!doctype html><meta charset="utf-8"><title>kodo</title>
<style>body{font:15px system-ui;background:#0a0a0b;color:#ececed;display:grid;place-items:center;height:100vh;margin:0}
div{max-width:420px;text-align:center}h1{font-size:18px;color:${ok ? '#b7f26b' : '#ff7a7a'}}p{color:#9a9aa3}</style>
<div><h1>${ok ? "Connected" : "Sign-in failed"}</h1><p>${esc(message)}</p><p><a href="/" style="color:#b7f26b">Back to kodo</a></p></div>
<script>try{window.opener&&window.opener.postMessage({kodo:'oauth',ok:${ok}},location.origin)}catch(e){}${ok ? 'setTimeout(function(){window.close()},1200)' : ''}</script>`
}

// ---------------------------------------------------------------- api

async function modelsPayload(fresh) {
  const out = []
  const errors = {}
  await Promise.all(
    providers.listProviders().filter((p) => p.configured).map(async (p) => {
      try {
        for (const m of await providers.listModels(p.id, { fresh })) {
          out.push({ id: `${p.id}:${m.id}`, provider: p.id, providerName: p.name, model: m.id, name: m.name, ctx: m.ctx })
        }
      } catch (e) {
        errors[p.id] = e.message
      }
    }),
  )
  return { models: out, errors }
}

async function api(req, res, url, query) {
  const m = req.method

  if (m === 'GET' && url === '/api/state') {
    return send(res, 200, {
      version: pkg.version,
      node: process.version,
      platform: process.platform,
      remote,
      configPath: config.file,
      workspace: await workspace.info(root),
      recents: (config.load().recentWorkspaces || []).filter(isDir).map((p) => ({ path: p, name: path.basename(p) || p })),
      providers: providers.listProviders().map(providers.publicInfo),
    })
  }

  if (m === 'POST' && url === '/api/workspace') {
    const body = await readJson(req)
    const next = path.resolve(String(body.path || ''))
    if (!isDir(next)) throw httpErr(400, 'Not a directory: ' + next)
    root = next
    remember(root)
    return send(res, 200, { workspace: await workspace.info(root) })
  }

  if (m === 'GET' && url === '/api/browse') return send(res, 200, browse(query.get('path') || ''))

  if (m === 'POST' && url === '/api/providers') {
    const body = await readJson(req)
    const id = providers.addCustom(body)
    return send(res, 200, { id })
  }

  let pm = /^\/api\/providers\/([\w-]+)$/.exec(url)
  if (pm) {
    const id = pm[1]
    const p = providers.describe(id)
    if (!p) throw httpErr(404, 'Unknown provider')
    if (m === 'PUT') {
      const body = await readJson(req)
      const patch = {}
      if (typeof body.apiKey === 'string') {
        patch.apiKey = body.apiKey.trim() || undefined
        patch.oauth = undefined
        patch.via = undefined
      }
      if (typeof body.baseUrl === 'string') {
        const b = body.baseUrl.trim()
        if (b && !/^https?:\/\//i.test(b)) throw httpErr(400, 'Base URL must start with http:// or https://')
        patch.baseUrl = b || undefined
      }
      config.setProvider(id, { ...patch, enabled: true })
      providers.clearModelCache(id)
      return send(res, 200, { ok: true })
    }
    if (m === 'DELETE') {
      config.removeProvider(id)
      providers.clearModelCache(id)
      return send(res, 200, { ok: true })
    }
  }

  if (m === 'GET' && url === '/api/models') return send(res, 200, await modelsPayload(query.get('fresh') === '1'))

  if (m === 'POST' && url === '/api/oauth/start') {
    const body = await readJson(req)
    const origin = (req.headers.origin || 'http://' + req.headers.host).replace(/\/$/, '')
    return send(res, 200, { url: providers.startOAuth(String(body.provider), origin) })
  }

  if (m === 'POST' && url === '/api/approve') {
    const body = await readJson(req)
    return send(res, 200, { ok: agent.resolveApproval(String(body.id), !!body.allow) })
  }

  if (m === 'GET' && url === '/api/files') {
    const ch = await workspace.changes(root).catch(() => ({ files: [] }))
    const status = Object.fromEntries(ch.files.map((f) => [f.path, f.status]))
    return send(res, 200, { files: workspace.tree(root, status) })
  }

  if (m === 'GET' && url === '/api/changes') return send(res, 200, await workspace.changes(root))

  if (m === 'POST' && url === '/api/commit') {
    const body = await readJson(req)
    return send(res, 200, { output: await workspace.commit(root, body.message) })
  }

  if (m === 'POST' && url === '/api/chat') {
    const body = await readJson(req)
    const sep = String(body.model || '').indexOf(':')
    const providerId = sep > 0 ? body.model.slice(0, sep) : ''
    const model = sep > 0 ? body.model.slice(sep + 1) : ''
    if (!providerId || !model) throw httpErr(400, 'Pick a model first.')

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    })
    const ac = new AbortController()
    res.on('close', () => ac.abort())
    const emit = (e) => {
      if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(e) + '\n')
    }
    try {
      await agent.run({
        providerId,
        model,
        history: body.messages,
        autoApprove: !!body.autoApprove,
        root,
        emit,
        signal: ac.signal,
      })
    } catch (e) {
      if (!ac.signal.aborted) emit({ type: 'error', message: e.message || String(e) })
      emit({ type: 'done', aborted: ac.signal.aborted })
    }
    return res.end()
  }

  throw httpErr(404, 'Not found')
}

function httpErr(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

// ---------------------------------------------------------------- server

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url || '/', 'http://x')
  const url = decodeURIComponent(parsed.pathname)

  if (remote && parsed.searchParams.get('token') === token) {
    res.writeHead(302, {
      'Set-Cookie': `kodo_token=${token}; HttpOnly; SameSite=Strict; Path=/`,
      Location: url,
    })
    return res.end()
  }

  if (url.startsWith('/api/')) {
    const bad = guard(req)
    if (bad) return send(res, 403, { error: bad })
    try {
      return await api(req, res, url, parsed.searchParams)
    } catch (e) {
      if (res.headersSent) return res.end()
      return send(res, e.status || 500, { error: e.message || String(e) })
    }
  }

  if (url === '/oauth/callback') {
    const bad = guard(req)
    if (bad) return send(res, 403, oauthPage(false, bad), { 'Content-Type': 'text/html; charset=utf-8' })
    const q = Object.fromEntries(parsed.searchParams)
    try {
      const id = await providers.finishOAuth(q)
      const name = providers.describe(id)?.name || id
      return send(res, 200, oauthPage(true, `${name} is connected. You can close this tab.`), {
        'Content-Type': 'text/html; charset=utf-8',
      })
    } catch (e) {
      return send(res, 400, oauthPage(false, e.message), { 'Content-Type': 'text/html; charset=utf-8' })
    }
  }

  const hit = files.get(url) || files.get(url.replace(/\/$/, '/index.html'))
  if (hit) {
    res.writeHead(200, {
      'Content-Type': hit.kind,
      'Content-Length': hit.body.length,
      'Cache-Control': url === '/' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    })
    return res.end(req.method === 'HEAD' ? undefined : hit.body)
  }

  if (index && path.extname(url) === '') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' })
    return res.end(req.method === 'HEAD' ? undefined : index.body)
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('404 — not found\n')
})

const base = Number(value('--port', '4173'))
let attempt = 0

function openBrowser(url) {
  if (flag('--no-open')) return
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`
  exec(cmd, () => {})
}

function listen(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 20) {
      attempt += 1
      listen(port + 1)
      return
    }
    process.stderr.write(`kodo: ${err.message}\n`)
    process.exit(1)
  })
  server.listen(port, host, () => {
    const shown = host === '0.0.0.0' ? '127.0.0.1' : host
    const url = `http://${shown}:${port}/` + (remote ? `?token=${token}` : '')
    process.stdout.write(`\n  kodo ${pkg.version} is running at ${url}\n  Workspace: ${root}\n  Press Ctrl+C to stop.\n\n`)
    if (remote) {
      process.stdout.write(
        '  WARNING: bound to a non-loopback address. kodo can run commands in the workspace;\n  only open the URL above (it carries a one-time access token) on networks you trust.\n\n',
      )
    }
    openBrowser(url)
  })
}

listen(base)

const shutdown = () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 300).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
