'use strict'

// Credentials and provider settings live in ~/.kodo/config.json (override with KODO_HOME).
// The file is written with 0600 permissions and secrets are never sent back to the browser.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const dir = process.env.KODO_HOME || path.join(os.homedir(), '.kodo')
const file = path.join(dir, 'config.json')

let cache = null

function load() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    cache = {}
  }
  if (!cache.providers) cache.providers = {}
  return cache
}

function save() {
  fs.mkdirSync(dir, { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

function getProvider(id) {
  return load().providers[id] || null
}

function setProvider(id, patch) {
  const cfg = load()
  cfg.providers[id] = { ...(cfg.providers[id] || {}), ...patch }
  save()
  return cfg.providers[id]
}

function removeProvider(id) {
  const cfg = load()
  delete cfg.providers[id]
  save()
}

module.exports = { dir, file, load, save, getProvider, setProvider, removeProvider }
