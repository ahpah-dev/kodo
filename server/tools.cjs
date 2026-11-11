'use strict'

// The agent's tools. All file access is confined to the workspace root.
// read/glob/grep run freely; write/edit/bash ask for approval unless auto-approve is on.

const fs = require('node:fs')
const path = require('node:path')
const { spawn, execFile } = require('node:child_process')
const { IGNORED_DIRS, resolveIn, toPosix, diffLines } = require('./workspace.cjs')

const MAX_RESULT = 30_000
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[A-Za-z]', 'g')

const clip = (s, n = MAX_RESULT) =>
  s.length <= n ? s : s.slice(0, Math.floor(n * 0.4)) + `\n… [${s.length - n} characters truncated] …\n` + s.slice(-Math.floor(n * 0.6))

const lines = (s, n = 300) => {
  const all = s.split('\n')
  return all.length > n ? [...all.slice(0, n), `… ${all.length - n} more lines`] : all
}

const oneLine = (s, n = 110) => {
  const first = String(s).split('\n')[0]
  return first.length > n ? first.slice(0, n) + '…' : first
}

function escapeRe(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

function globToRegex(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') {
          i++
          re += '(?:.*/)?'
        } else re += '.*'
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else if (c === '{') {
      const j = glob.indexOf('}', i)
      if (j > i) {
        re += '(?:' + glob.slice(i + 1, j).split(',').map(escapeRe).join('|') + ')'
        i = j
      } else re += '\\{'
    } else re += escapeRe(c)
  }
  return new RegExp('^' + re + '$')
}

function matcher(glob) {
  const re = globToRegex(glob.replace(/^\.\//, ''))
  const bare = !glob.includes('/')
  return (rel) => re.test(rel) || (bare && re.test(rel.split('/').pop()))
}

function* walk(root, dir, budget = { n: 30_000 }) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (budget.n-- <= 0) return
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!IGNORED_DIRS.has(e.name)) yield* walk(root, full, budget)
    } else if (e.isFile()) {
      yield { full, rel: toPosix(path.relative(root, full)) }
    }
  }
}

function readText(abs, max = 2 * 1024 * 1024) {
  const st = fs.statSync(abs)
  if (!st.isFile()) throw new Error('Not a file')
  if (st.size > max) throw new Error(`File is too large (${st.size} bytes)`)
  const buf = fs.readFileSync(abs)
  if (buf.subarray(0, 4096).includes(0)) throw new Error('File looks binary')
  return buf.toString('utf8')
}

function killTree(child) {
  try {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {})
    } else {
      process.kill(-child.pid, 'SIGKILL')
    }
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      /* gone */
    }
  }
}

const tools = [
  {
    name: 'read',
    description:
      'Read a text file from the workspace. Returns numbered lines. Use offset/limit (1-based line numbers) for large files.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace root' },
        offset: { type: 'integer', description: 'First line to read (1-based)' },
        limit: { type: 'integer', description: 'Maximum number of lines (default 2000)' },
      },
      required: ['path'],
    },
    title: (i) => `Read ${i.path}`,
    run(i, { root }) {
      const text = readText(resolveIn(root, i.path))
      const all = text.split('\n')
      const start = Math.max(1, i.offset || 1)
      const end = Math.min(all.length, start - 1 + (i.limit || 2000))
      const width = String(end).length
      const out = all.slice(start - 1, end).map((l, k) => String(start + k).padStart(width) + '  ' + (l.length > 2000 ? l.slice(0, 2000) + '…' : l))
      const result = out.join('\n')
      return { result: clip(result), output: lines(result, 200), meta: `lines ${start}–${end}` }
    },
  },
  {
    name: 'glob',
    description: 'Find files by glob pattern (e.g. "src/**/*.ts", "*.json"). Skips node_modules, .git and build output.',
    schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern' },
        path: { type: 'string', description: 'Directory to search (default: workspace root)' },
      },
      required: ['pattern'],
    },
    title: (i) => `glob ${i.pattern}`,
    run(i, { root }) {
      const base = resolveIn(root, i.path || '.')
      const test = matcher(i.pattern)
      const hits = []
      for (const f of walk(root, base)) {
        const rel = toPosix(path.relative(base, f.full))
        if (test(rel)) hits.push(f.rel)
        if (hits.length >= 500) break
      }
      hits.sort()
      const result = hits.length ? hits.join('\n') : 'No files matched.'
      return { result, output: lines(result), meta: `${hits.length} files` }
    },
  },
  {
    name: 'grep',
    description: 'Search file contents with a regular expression. Returns path:line: text. Skips node_modules, .git and binaries.',
    schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'JavaScript regular expression' },
        path: { type: 'string', description: 'File or directory to search (default: workspace root)' },
        glob: { type: 'string', description: 'Only search files matching this glob' },
        ignore_case: { type: 'boolean' },
      },
      required: ['pattern'],
    },
    title: (i) => `grep ${i.pattern}${i.path ? ' ' + i.path : ''}`,
    run(i, { root }) {
      let re
      try {
        re = new RegExp(i.pattern, i.ignore_case ? 'i' : '')
      } catch (e) {
        throw new Error('Invalid regular expression: ' + e.message)
      }
      const base = resolveIn(root, i.path || '.')
      const test = i.glob ? matcher(i.glob) : () => true
      const files = fs.statSync(base).isFile()
        ? [{ full: base, rel: toPosix(path.relative(root, base)) }]
        : walk(root, base)
      const hits = []
      const seen = new Set()
      for (const f of files) {
        if (hits.length >= 200) break
        if (!test(f.rel)) continue
        let text
        try {
          text = readText(f.full, 1024 * 1024)
        } catch {
          continue
        }
        const all = text.split('\n')
        for (let n = 0; n < all.length && hits.length < 200; n++) {
          if (re.test(all[n])) {
            hits.push(`${f.rel}:${n + 1}: ${all[n].trim().slice(0, 300)}`)
            seen.add(f.rel)
          }
        }
      }
      const result = hits.length ? hits.join('\n') : 'No matches.'
      return { result: clip(result), output: lines(result), meta: `${hits.length} matches in ${seen.size} files` }
    },
  },
  {
    name: 'write',
    description: 'Create or overwrite a file with the given content. Creates parent directories. Prefer edit for changing existing files.',
    needsApproval: true,
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace root' },
        content: { type: 'string', description: 'Complete file content' },
      },
      required: ['path', 'content'],
    },
    title: (i) => `Write ${i.path}`,
    preview(i, { root }) {
      const abs = resolveIn(root, i.path)
      const old = fs.existsSync(abs) ? readText(abs) : ''
      return { diff: diffLines(old, String(i.content ?? '')).diff }
    },
    run(i, { root }) {
      const abs = resolveIn(root, i.path)
      const existed = fs.existsSync(abs)
      const old = existed ? readText(abs) : ''
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, String(i.content ?? ''))
      const d = diffLines(old, String(i.content ?? ''))
      return {
        result: `${existed ? 'Overwrote' : 'Created'} ${i.path} (${String(i.content ?? '').split('\n').length} lines)`,
        diff: d.diff,
        meta: existed ? `+${d.adds} −${d.dels}` : `+${d.adds} new file`,
      }
    },
  },
  {
    name: 'edit',
    description:
      'Replace text in an existing file. old_string must match exactly (including whitespace) and be unique unless replace_all is true. Read the file first.',
    needsApproval: true,
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', description: 'Exact text to replace' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    title: (i) => `Edit ${i.path}`,
    apply(i, { root }) {
      const abs = resolveIn(root, i.path)
      const old = readText(abs)
      const crlf = old.includes('\r\n')
      const fix = (s) => (crlf && !s.includes('\r') ? s.replace(/\n/g, '\r\n') : s)
      const from = fix(String(i.old_string ?? ''))
      const to = fix(String(i.new_string ?? ''))
      if (!from) throw new Error('old_string must not be empty (use write to create a file)')
      const count = old.split(from).length - 1
      if (count === 0) throw new Error('old_string was not found in the file. Re-read the file and match it exactly.')
      if (count > 1 && !i.replace_all) {
        throw new Error(`old_string matches ${count} places. Add more context to make it unique, or set replace_all.`)
      }
      const next = i.replace_all ? old.split(from).join(to) : old.replace(from, () => to)
      return { abs, old, next, count }
    },
    preview(i, ctx) {
      const { old, next } = this.apply(i, ctx)
      return { diff: diffLines(old, next).diff }
    },
    run(i, ctx) {
      const { abs, old, next, count } = this.apply(i, ctx)
      fs.writeFileSync(abs, next)
      const d = diffLines(old, next)
      return {
        result: `Edited ${i.path} (${i.replace_all ? count + ' replacements' : '1 replacement'})`,
        diff: d.diff,
        meta: `+${d.adds} −${d.dels}`,
      }
    },
  },
  {
    name: 'bash',
    description:
      'Run a shell command in the workspace root and return combined stdout/stderr and the exit code. Commands that never exit (dev servers, watchers) will time out.',
    needsApproval: true,
    schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout: { type: 'integer', description: 'Timeout in seconds (default 120, max 600)' },
      },
      required: ['command'],
    },
    title: (i) => oneLine(i.command),
    preview: (i) => ({ output: String(i.command || '').split('\n') }),
    run(i, { root, signal }) {
      return new Promise((resolve, reject) => {
        const timeoutMs = Math.min(Math.max(i.timeout || 120, 1), 600) * 1000
        const started = Date.now()
        const child = spawn(String(i.command), {
          cwd: root,
          shell: true,
          windowsHide: true,
          detached: process.platform !== 'win32',
          env: { ...process.env, CI: '1', TERM: 'dumb', NO_COLOR: '1' },
        })
        let out = ''
        let timedOut = false
        const add = (d) => {
          out += d.toString('utf8')
          if (out.length > 400_000) out = out.slice(-300_000)
        }
        child.stdout.on('data', add)
        child.stderr.on('data', add)
        const timer = setTimeout(() => {
          timedOut = true
          killTree(child)
        }, timeoutMs)
        const onAbort = () => killTree(child)
        signal.addEventListener('abort', onAbort, { once: true })
        child.on('error', (e) => {
          clearTimeout(timer)
          reject(e)
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          signal.removeEventListener('abort', onAbort)
          const secs = ((Date.now() - started) / 1000).toFixed(1)
          const text = clip(out.replace(ANSI, '').trimEnd())
          const status = timedOut ? `timed out after ${timeoutMs / 1000}s` : `exit ${code}`
          resolve({
            result: (text ? text + '\n' : '') + `[${status}]`,
            output: lines(text || '(no output)'),
            meta: `${status} · ${secs}s`,
            isError: timedOut || code !== 0,
          })
        })
      })
    },
  },
]

const byName = Object.fromEntries(tools.map((t) => [t.name, t]))

module.exports = { tools, byName, clip, oneLine }
