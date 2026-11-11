'use strict'

// Workspace helpers: path safety, line diffs, git state, and the file tree.

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'release', 'target', '.next', '.nuxt', '.turbo',
  '.cache', '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'coverage',
])

function resolveIn(root, p) {
  const abs = path.resolve(root, p || '.')
  const rel = path.relative(root, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path is outside the workspace: ${p}`)
  }
  return abs
}

const toPosix = (p) => p.split(path.sep).join('/')

// ------------------------------------------------------------------ diff

function diffLines(oldText, newText, context = 3, cap = 400) {
  const toLines = (t) => (t === '' ? [] : t.replace(/\n$/, '').split('\n'))
  const A = toLines(oldText)
  const B = toLines(newText)
  let s = 0
  while (s < A.length && s < B.length && A[s] === B[s]) s++
  let ea = A.length
  let eb = B.length
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) {
    ea--
    eb--
  }
  const midA = A.slice(s, ea)
  const midB = B.slice(s, eb)

  const mid = []
  if (midA.length * midB.length <= 4_000_000) {
    const n = midA.length
    const m = midB.length
    const w = m + 1
    const dp = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] =
          midA[i] === midB[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        mid.push({ t: 'ctx', a: s + i + 1, b: s + j + 1, text: midA[i] })
        i++
        j++
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
        mid.push({ t: 'del', a: s + i + 1, text: midA[i++] })
      } else {
        mid.push({ t: 'add', b: s + j + 1, text: midB[j++] })
      }
    }
    while (i < n) mid.push({ t: 'del', a: s + i + 1, text: midA[i++] })
    while (j < m) mid.push({ t: 'add', b: s + j + 1, text: midB[j++] })
  } else {
    midA.forEach((text, i) => mid.push({ t: 'del', a: s + i + 1, text }))
    midB.forEach((text, j) => mid.push({ t: 'add', b: s + j + 1, text }))
  }

  const all = []
  for (let i = 0; i < s; i++) all.push({ t: 'ctx', a: i + 1, b: i + 1, text: A[i] })
  all.push(...mid)
  for (let k = 0; k < A.length - ea; k++) {
    all.push({ t: 'ctx', a: ea + k + 1, b: eb + k + 1, text: A[ea + k] })
  }

  const keep = new Array(all.length).fill(false)
  all.forEach((l, i) => {
    if (l.t === 'ctx') return
    for (let k = Math.max(0, i - context); k <= Math.min(all.length - 1, i + context); k++) keep[k] = true
  })

  const out = []
  let adds = 0
  let dels = 0
  all.forEach((l, i) => {
    if (l.t === 'add') adds++
    if (l.t === 'del') dels++
    if (keep[i]) out.push({ t: l.t, n: l.t === 'add' ? l.b : l.t === 'del' ? l.a : l.b, text: l.text })
  })
  return { diff: out.slice(0, cap), adds, dels, truncated: out.length > cap }
}

// ------------------------------------------------------------------ git

function git(cwd, args, { allowFail } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout: 15_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err && !allowFail) return reject(new Error((stderr || err.message).trim()))
        resolve(err ? '' : stdout)
      },
    )
  })
}

async function info(root) {
  const base = { name: path.basename(root) || root, path: root, branch: null, ahead: 0, git: false }
  try {
    const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim()
    if (!top) return base
    base.git = true
    base.branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true })).trim() || 'HEAD'
    const ahead = (await git(root, ['rev-list', '--count', '@{u}..HEAD'], { allowFail: true })).trim()
    base.ahead = Number(ahead) || 0
  } catch {
    /* not a git repo */
  }
  return base
}

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

function parseUnified(text) {
  const out = []
  let a = 0
  let b = 0
  let adds = 0
  let dels = 0
  let inHunk = false
  for (const line of text.split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (h) {
      a = Number(h[1])
      b = Number(h[2])
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('+')) {
      out.push({ t: 'add', n: b++, text: line.slice(1) })
      adds++
    } else if (line.startsWith('-')) {
      out.push({ t: 'del', n: a++, text: line.slice(1) })
      dels++
    } else if (line.startsWith(' ')) {
      out.push({ t: 'ctx', n: b, text: line.slice(1) })
      a++
      b++
    }
  }
  return { diff: out.slice(0, 600), adds, dels }
}

async function changes(root) {
  const inRepo = (await git(root, ['rev-parse', '--is-inside-work-tree'], { allowFail: true })).trim() === 'true'
  if (!inRepo) return { git: false, files: [] }

  const hasHead = !!(await git(root, ['rev-parse', '--verify', 'HEAD'], { allowFail: true })).trim()
  const base = hasHead ? 'HEAD' : EMPTY_TREE
  const status = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const entries = status.split('\0').filter(Boolean)
  const files = []

  for (let i = 0; i < entries.length && files.length < 60; i++) {
    const e = entries[i]
    const code = e.slice(0, 2)
    const file = e.slice(3)
    if (code[0] === 'R' || code[0] === 'C') i++ // skip the "from" path
    if (code === '??') {
      try {
        const abs = resolveIn(root, file)
        const st = fs.statSync(abs)
        if (st.size > 512 * 1024) {
          files.push({ path: file, status: 'A', adds: 0, dels: 0, diff: [], note: 'Large file' })
          continue
        }
        const buf = fs.readFileSync(abs)
        if (buf.subarray(0, 4096).includes(0)) {
          files.push({ path: file, status: 'A', adds: 0, dels: 0, diff: [], note: 'Binary file' })
          continue
        }
        const d = diffLines('', buf.toString('utf8'))
        files.push({ path: file, status: 'A', adds: d.adds, dels: d.dels, diff: d.diff })
      } catch {
        /* vanished */
      }
      continue
    }
    const text = await git(root, ['diff', '--no-color', '--no-ext-diff', '-U3', base, '--', file], { allowFail: true })
    const parsed = parseUnified(text)
    const st = code.includes('D') ? 'D' : code.includes('A') ? 'A' : code.includes('R') ? 'R' : 'M'
    files.push({
      path: file,
      status: st,
      adds: parsed.adds,
      dels: parsed.dels,
      diff: parsed.diff,
      note: /^Binary files /m.test(text) ? 'Binary file' : undefined,
    })
  }
  return { git: true, files }
}

async function commit(root, message) {
  if (!message?.trim()) throw new Error('Commit message is required')
  await git(root, ['add', '-A'])
  const out = await git(root, ['commit', '-m', message.trim()])
  return out.trim()
}

// ------------------------------------------------------------------ files

const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB')

function tree(root, statusByPath = {}, limit = 3000) {
  let count = 0
  const walk = (dir, depth) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    const nodes = []
    for (const e of entries) {
      if (count >= limit) break
      if (e.isDirectory() && (IGNORED_DIRS.has(e.name) || depth >= 8)) continue
      if (e.name === '.DS_Store') continue
      const full = path.join(dir, e.name)
      const rel = toPosix(path.relative(root, full))
      count++
      if (e.isDirectory()) {
        nodes.push({ path: rel, kind: 'dir', children: walk(full, depth + 1) })
      } else if (e.isFile()) {
        let size = ''
        try {
          size = fmtSize(fs.statSync(full).size)
        } catch {
          /* ignore */
        }
        nodes.push({ path: rel, kind: 'file', size, status: statusByPath[rel] })
      }
    }
    return nodes
  }
  return walk(root, 0)
}

module.exports = { IGNORED_DIRS, resolveIn, toPosix, diffLines, info, changes, commit, tree }
