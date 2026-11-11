// Talks to the local kodo server, which runs the real agent loop against the chosen
// provider. The server streams newline-delimited JSON events; `emit` receives them as-is:
//   status, reasoning-start|delta|end, text-start|delta|end,
//   tool-start, tool-update, tool-end, usage, error, done

export function titleFor(prompt) {
  const words = prompt.replace(/\s+/g, ' ').trim().split(' ')
  const s = words.slice(0, 7).join(' ')
  if (!s) return 'New session'
  const t = s.length > 46 ? s.slice(0, 46) + '…' : s
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Only what the server needs to rebuild the provider conversation.
export function toWire(messages) {
  return messages.map((m) =>
    m.role === 'user'
      ? { role: 'user', content: m.content }
      : {
          role: 'assistant',
          parts: (m.parts || [])
            .filter((p) => p.type === 'text' || (p.type === 'tool' && p.input))
            .map((p) =>
              p.type === 'text'
                ? { type: 'text', text: p.text }
                : { type: 'tool', id: p.id, name: p.name, input: p.input, result: p.result, status: p.status, via: p.via, extra: p.extra },
            ),
        },
  )
}

export async function runAgent({ model, messages, autoApprove, signal, emit }) {
  let res
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: toWire(messages), autoApprove }),
      signal,
    })
  } catch {
    if (signal.aborted) return emit({ type: 'done', aborted: true })
    throw new Error('Could not reach the kodo server. Is it still running?')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) emit(JSON.parse(line))
      }
    }
  } catch (err) {
    if (signal.aborted) return emit({ type: 'done', aborted: true })
    throw err
  }
}
