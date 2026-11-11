'use strict'

const http = require('node:http')
const path = require('node:path')
const { exec } = require('node:child_process')
const { readFileSync, existsSync } = require('node:fs')

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
      'kodo — local coding agent UI',
      '',
      'Usage: kodo [options]',
      '',
      '  --port <n>   Port to listen on (default 4173)',
      '  --host <h>   Host to bind (default 127.0.0.1)',
      '  --no-open    Do not open the browser',
      '  --help       Show this help',
      '',
    ].join('\n'),
  )
  process.exit(0)
}

const distDir = path.join(__dirname, 'dist')
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
    for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        const rel = '/' + path.relative(distDir, full).split(path.sep).join('/')
        files.set(rel, {
          body: readFileSync(full),
          kind: TYPES[path.extname(full)] || 'application/octet-stream',
        })
      }
    }
  }
  if (existsSync(distDir)) walk(distDir)
}

load()

if (files.size === 0) {
  process.stderr.write('kodo: no web assets found. Run `npm run build` first.\n')
  process.exit(1)
}

const index = files.get('/index.html')

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  const hit = files.get(url) || files.get(url.replace(/\/$/, '/index.html'))

  if (hit) {
    res.writeHead(200, {
      'Content-Type': hit.kind,
      'Content-Length': hit.body.length,
      'Cache-Control': url === '/' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(req.method === 'HEAD' ? undefined : hit.body)
    return
  }

  if (index && path.extname(url) === '') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' })
    res.end(req.method === 'HEAD' ? undefined : index.body)
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('404 — not found\n')
})

const host = value('--host', '127.0.0.1')
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
    const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`
    process.stdout.write(`\n  kodo is running at ${url}\n  Press Ctrl+C to stop.\n\n`)
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
