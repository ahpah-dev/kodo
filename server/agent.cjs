'use strict'

// The agent loop: stream a model turn, run any requested tools, feed results back, repeat.
// Events emitted here are exactly what the UI folds into message parts.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const providers = require('./providers.cjs')
const { tools, byName, clip } = require('./tools.cjs')

const MAX_STEPS = 40
const approvals = new Map()

function resolveApproval(id, allow) {
  const done = approvals.get(id)
  if (!done) return false
  approvals.delete(id)
  done(!!allow)
  return true
}

function awaitApproval(id, signal) {
  return new Promise((resolve) => {
    approvals.set(id, resolve)
    signal.addEventListener(
      'abort',
      () => {
        approvals.delete(id)
        resolve(false)
      },
      { once: true },
    )
  })
}

const rid = (p) => p + '-' + crypto.randomBytes(4).toString('hex')
const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '_')

function projectInstructions(root) {
  for (const name of ['AGENTS.md', 'CLAUDE.md', 'KODO.md']) {
    try {
      const text = fs.readFileSync(path.join(root, name), 'utf8')
      return `\n\nProject instructions (${name}):\n${clip(text, 12_000)}`
    } catch {
      /* none */
    }
  }
  return ''
}

function systemPrompt(root) {
  const shell = process.platform === 'win32' ? 'cmd.exe (Windows)' : process.env.SHELL || '/bin/sh'
  return [
    'You are kodo, a coding agent working inside a local project on the user\'s machine.',
    'You can read, search, edit and create files and run shell commands through your tools. Use them: inspect the code before answering questions about it, and verify your changes (build, lint, tests) when the project has them.',
    '',
    'Guidelines:',
    '- Be concise and direct. Lead with the result; do not narrate every step.',
    '- Read a file before editing it. Make small, targeted edits with the edit tool; use write only for new files or full rewrites.',
    '- Use glob and grep to explore instead of guessing paths. All paths are relative to the workspace root.',
    '- Never run destructive or irreversible commands (deleting data, force pushes, publishing) unless the user clearly asked for them.',
    '- Some tool calls require the user\'s approval; if one is denied, do not retry it, and ask how to proceed.',
    '- Format replies in Markdown. Use fenced code blocks with a language tag.',
    '',
    `Workspace root: ${root}`,
    `Platform: ${process.platform}; shell for the bash tool: ${shell}`,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
  ].join('\n') + projectInstructions(root)
}

// Rebuild the provider conversation from the UI's saved messages.
function rebuild(messages, providerId) {
  const out = []
  for (const m of messages || []) {
    if (m.role === 'user') {
      if (m.content) out.push({ role: 'user', content: String(m.content) })
      continue
    }
    let blocks = []
    let results = []
    const flush = () => {
      if (blocks.length) out.push({ role: 'assistant', blocks })
      if (results.length) out.push({ role: 'tool', results })
      blocks = []
      results = []
    }
    for (const p of m.parts || []) {
      if (p.type === 'text') {
        if (results.length) flush()
        if (p.text) blocks.push({ type: 'text', text: p.text })
      } else if (p.type === 'tool' && p.input && p.name && byName[p.name]) {
        const id = safeId(p.id)
        blocks.push({ type: 'tool_use', id, name: p.name, input: p.input, extra: p.via === providerId ? p.extra : undefined })
        results.push({
          id,
          content: typeof p.result === 'string' ? p.result : 'Interrupted before completion.',
          isError: p.status !== 'done',
        })
      }
    }
    flush()
  }
  return out
}

async function run({ providerId, model, history, autoApprove, root, emit, signal }) {
  let p = await providers.ensureFresh(providerId)
  if (!p || !p.configured) {
    throw new Error(`${p?.name || providerId} is not set up. Add an API key or sign in from Settings.`)
  }

  const system = systemPrompt(root)
  const messages = rebuild(history, providerId)
  const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, schema: t.schema }))

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) return emit({ type: 'done', aborted: true })
    if (step > 0) p = await providers.ensureFresh(providerId)

    emit({ type: 'status', status: 'thinking' })
    const blocks = []
    const calls = []
    let seg = null // { kind: 'text' | 'reasoning', id }

    const close = () => {
      if (!seg) return
      emit({ type: seg.kind === 'text' ? 'text-end' : 'reasoning-end', id: seg.id })
      seg = null
    }
    const open = (kind) => {
      if (seg?.kind === kind) return
      close()
      seg = { kind, id: rid(kind === 'text' ? 'txt' : 'rsn') }
      if (kind === 'text') {
        emit({ type: 'status', status: 'writing' })
        emit({ type: 'text-start', id: seg.id })
        blocks.push({ type: 'text', text: '' })
      } else emit({ type: 'reasoning-start', id: seg.id })
    }

    try {
      for await (const ev of providers.stream(p, { model, system, messages, tools: toolDefs, signal })) {
        if (ev.type === 'text') {
          open('text')
          blocks[blocks.length - 1].text += ev.text
          emit({ type: 'text-delta', id: seg.id, text: ev.text })
        } else if (ev.type === 'reasoning') {
          open('reasoning')
          emit({ type: 'reasoning-delta', id: seg.id, text: ev.text })
        } else if (ev.type === 'tool') {
          close()
          const call = { ...ev, id: safeId(ev.id) }
          calls.push(call)
          blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input, extra: call.extra })
        } else if (ev.type === 'usage') {
          emit({ type: 'usage', input: ev.input, output: ev.output })
        }
      }
    } catch (err) {
      close()
      if (signal.aborted) return emit({ type: 'done', aborted: true })
      throw err
    }
    close()

    messages.push({ role: 'assistant', blocks })
    if (!calls.length) break

    const results = []
    for (const call of calls) {
      if (signal.aborted) {
        results.push({ id: call.id, content: 'Interrupted by the user.', isError: true })
        continue
      }
      results.push(await execTool(call, { providerId, root, signal, autoApprove, emit }))
    }
    messages.push({ role: 'tool', results })
    if (signal.aborted) return emit({ type: 'done', aborted: true })

    if (step === MAX_STEPS - 1) {
      emit({ type: 'error', message: `Stopped after ${MAX_STEPS} steps. Send a message to continue.` })
    }
  }

  emit({ type: 'status', status: 'idle' })
  emit({ type: 'done' })
}

async function execTool(call, { providerId, root, signal, autoApprove, emit }) {
  const tool = byName[call.name]
  const base = { id: call.id, name: call.name, input: call.input, extra: call.extra, via: providerId }
  const ctx = { root, signal }

  if (!tool) {
    emit({ type: 'tool-start', tool: { ...base, name: 'tool', title: call.name, status: 'error' } })
    const msg = `Unknown tool: ${call.name}`
    emit({ type: 'tool-end', id: call.id, status: 'error', patch: { output: [msg], result: msg } })
    return { id: call.id, content: msg, isError: true }
  }

  const fail = (msg, status = 'error') => {
    emit({ type: 'tool-end', id: call.id, status, patch: { output: [msg], result: msg, diff: null, approvalId: null } })
    return { id: call.id, content: msg, isError: true }
  }

  if (call.parseError) {
    emit({ type: 'tool-start', tool: { ...base, title: tool.name, status: 'running' } })
    return fail(call.parseError + '. Retry with valid JSON arguments.')
  }

  let title
  try {
    title = tool.title(call.input || {})
  } catch {
    title = tool.name
  }

  const needsApproval = tool.needsApproval && !autoApprove
  let preview = {}
  if (needsApproval && tool.preview) {
    try {
      preview = tool.preview(call.input || {}, ctx)
    } catch (e) {
      emit({ type: 'tool-start', tool: { ...base, title, status: 'running' } })
      return fail(e.message)
    }
  }

  emit({
    type: 'tool-start',
    tool: { ...base, title, status: needsApproval ? 'pending' : 'running', approvalId: needsApproval ? call.id : undefined, ...preview },
  })

  if (needsApproval) {
    emit({ type: 'status', status: 'waiting' })
    const allowed = await awaitApproval(call.id, signal)
    if (!allowed) {
      const msg = signal.aborted ? 'Interrupted by the user.' : 'The user denied this action.'
      emit({ type: 'tool-end', id: call.id, status: signal.aborted ? 'aborted' : 'denied', patch: { approvalId: null, result: msg } })
      return { id: call.id, content: msg, isError: true }
    }
    emit({ type: 'tool-update', id: call.id, patch: { status: 'running', approvalId: null } })
  }

  emit({ type: 'status', status: 'working' })
  try {
    const out = await tool.run(call.input || {}, ctx)
    if (signal.aborted) {
      emit({ type: 'tool-end', id: call.id, status: 'aborted', patch: { result: 'Interrupted by the user.' } })
      return { id: call.id, content: 'Interrupted by the user.', isError: true }
    }
    emit({
      type: 'tool-end',
      id: call.id,
      status: out.isError ? 'error' : 'done',
      patch: { meta: out.meta, output: out.output, diff: out.diff, result: out.result },
    })
    return { id: call.id, content: out.result, isError: !!out.isError }
  } catch (e) {
    return fail(e.message || String(e))
  }
}

module.exports = { run, resolveApproval }
