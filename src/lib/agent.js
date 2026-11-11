import { changes } from './workspace'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function detectKind(prompt) {
  const p = prompt.toLowerCase()
  if (/(explain|understand|walk me|architecture|how does|codebase|overview)/.test(p)) return 'explain'
  if (/(fix|bug|broken|error|fail|crash|regress)/.test(p)) return 'fix'
  if (/(review|diff|changes|pr|commit)/.test(p)) return 'review'
  if (/(test|lint|build|run)/.test(p)) return 'verify'
  return 'build'
}

function shortName(prompt) {
  const words = prompt.replace(/\s+/g, ' ').trim().split(' ')
  const s = words.slice(0, 7).join(' ')
  return s.length > 46 ? s.slice(0, 46) + '…' : s
}

export function titleFor(prompt) {
  const t = shortName(prompt)
  if (!t) return 'New session'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const PLANS = {
  explain: [
    {
      reasoning:
        'The user wants a mental model of the project, not a file dump. I will start at the manifest to confirm the stack, then read the entry point and the top-level component to trace how state flows. Keeping the read surface small keeps the answer honest.',
      steps: [
        { type: 'tool', name: 'bash', title: 'ls -la && cat package.json', meta: '2 commands', duration: 700, output: [
          'total 96',
          'drwxr-xr-x  12 david  staff   384 Nov 11 14:02 .',
          'drwxr-xr-x   9 david  staff   288 Nov 11 09:41 ..',
          'drwxr-xr-x   6 david  staff   192 Nov 11 14:01 src',
          '-rw-r--r--   1 david  staff  1892 Nov 10 22:14 package.json',
          '',
          '{ "name": "kodo", "private": true, "type": "module",',
          '  "scripts": { "dev": "vite", "build": "vite build", "lint": "oxlint" },',
          '  "dependencies": { "react": "^19.3.1", "react-dom": "^19.3.1" } }',
        ] },
        { type: 'tool', name: 'glob', title: 'glob "src/**/*.{jsx,js}"', meta: '9 files', duration: 500, output: [
          'src/App.jsx',
          'src/main.jsx',
          'src/components/Composer.jsx',
          'src/components/Message.jsx',
          'src/components/Sidebar.jsx',
          'src/lib/agent.js',
          'src/lib/useAutosize.js',
        ] },
        { type: 'tool', name: 'read', title: 'Read src/App.jsx', meta: 'lines 1–88', duration: 600, output: [
          '1  import { useState } from "react"',
          '2  import { Sidebar } from "./components/Sidebar"',
          '3  import { Composer } from "./components/Composer"',
          '4  import { Message } from "./components/Message"',
          '5',
          '6  export default function App() {',
          '7    const [sessions, setSessions] = useState([])',
          '8    const [active, setActive] = useState(null)',
          '9',
          '10   return (',
          '11     <div className="app">',
          '12       <Sidebar sessions={sessions} active={active} onSelect={setActive} />',
          '13       <main><Message /><Composer onSend={send} /></main>',
          '14     </div>',
          '15   )',
          '16 }',
        ] },
        { type: 'text', text: 'Here is the shape of it:\n\n**`kodo` — a Vite + React 19 single-page app** with no router and no state library. Everything lives in one component tree and is threaded down as props.\n\n### Layers\n\n- **`src/main.jsx`** mounts `<App />` into `#root`.\n- **`src/App.jsx`** owns the session list and the active session id — this is the only real state container.\n- **`src/components/Sidebar.jsx`** renders sessions and fires `onSelect`. Presentational only.\n- **`src/components/Message.jsx`** renders one turn, including tool cards.\n- **`src/components/Composer.jsx`** owns the textarea, autosize, and submit.\n- **`src/lib/agent.js`** is the seam where an agent loop would stream events back into the UI.\n\n### Data flow\n\n```\nComposer --onSend--> App --append message--> messages[] --props--> Message\nSidebar  --onSelect-> App --setActive------> activeId\n```\n\nIt is intentionally shallow: one state owner, pure presentational children, and a single async module for side effects. That is the right shape for something this size — adding Redux here would be ceremony, not architecture.' },
      ],
    },
  ],
  fix: [
    {
      reasoning:
        'Start by reproducing the failure rather than guessing. Run the checks, read the error, then look at the file the trace points to. Only after the cause is proven should I edit anything.',
      steps: [
        { type: 'tool', name: 'bash', title: 'npm run lint && npm run build', meta: 'exit 1', duration: 900, output: [
          '> kodo@0.0.0 lint',
          '> oxlint',
          '',
          'src/components/Composer.jsx:20:9  error  react-hooks/exhaustive-deps',
          '  React Hook useEffect has a missing dependency: "maxHeight".',
          '',
          'Found 0 warnings and 1 error.',
          'Process finished with exit code 1',
        ] },
        { type: 'tool', name: 'grep', title: 'grep "scrollHeight|ref" src', meta: '4 matches in 2 files', duration: 500, output: [
          'src/components/Composer.jsx:13  el.style.height = "auto"',
          'src/components/Composer.jsx:14  const next = Math.min(el.scrollHeight, 168)',
          'src/components/Composer.jsx:16  setMaxHeight(next >= 168 ? 168 : 0)',
          'src/lib/useAutosize.js:3        if (!el) return { height: 0, scroll: false }',
        ] },
        { type: 'tool', name: 'read', title: 'Read src/lib/useAutosize.js', meta: 'lines 1–14', duration: 400, output: [
          '1  export function autosize(el, max = 168) {',
          '2    if (!el) return { height: 0, scroll: false }',
          '3',
          '4    el.style.height = "auto"',
          '5    const next = Math.min(el.scrollHeight, max)',
          '6    el.style.height = `${next}px`',
          '7',
          '8    return { height: next, scroll: next >= max }',
          '9  }',
        ] },
        { type: 'tool', name: 'edit', title: 'Edit src/components/Composer.jsx', meta: '+2 −2', duration: 700, diff: [
          { t: 'ctx', n: 9, text: '  useEffect(() => {' },
          { t: 'ctx', n: 10, text: '    const el = ref.current' },
          { t: 'ctx', n: 11, text: '    if (!el) return' },
          { t: 'ctx', n: 12, text: '' },
          { t: 'del', n: 13, text: '    el.style.height = "auto"' },
          { t: 'del', n: 14, text: '    const next = Math.min(el.scrollHeight, 168)' },
          { t: 'add', n: 13, text: '    const { height, scroll } = autosize(el)' },
          { t: 'add', n: 14, text: '    setMaxHeight(scroll ? height : 0)' },
          { t: 'ctx', n: 15, text: '  }, [value])' },
        ] },
        { type: 'tool', name: 'bash', title: 'npm run lint && npm run build', meta: 'exit 0 · 1.4s', duration: 1000, output: [
          '> kodo@0.0.0 lint',
          '> oxlint',
          '',
          'Found 0 warnings and 0 errors.',
          '',
          '> kodo@0.0.0 build',
          '> vite build',
          '✓ 42 modules transformed.',
          '✓ built in 1.18s',
        ] },
        { type: 'text', text: "Root cause: the effect inlined the measurement logic, so `setMaxHeight` ran inside a callback that only depended on `value` — and the duplicated implementation drifted from `useAutosize.js`. Oxlint caught the inconsistency.\n\n**Fix** — delegate to the single source of truth:\n\n```js\nuseEffect(() => {\n  const el = ref.current\n  if (!el) return\n\n  const { height, scroll } = autosize(el)\n  setMaxHeight(scroll ? height : 0)\n}, [value])\n```\n\nLint and build are both clean. The remaining risk is wrapped text with `word-break` styles — if you use those, the measurement still works because `scrollHeight` reflects layout, not character count." },
      ],
    },
  ],
  review: [
    {
      reasoning:
        'A useful review needs the actual diff, not the working tree. Read the diff, then check call sites so I can tell breaking changes apart from cosmetic ones. Then run whatever verification exists.',
      steps: [
        { type: 'tool', name: 'bash', title: 'git diff --stat && git diff', meta: '3 files', duration: 800, output: [
          ' src/components/Composer.jsx | 25 +++++++++++++++------',
          ' src/lib/agent.js          | 12 ++++++++----',
          ' src/lib/useAutosize.js     | 14 ++++++++++++++',
          ' 3 files changed, 41 insertions(+), 10 deletions(-)',
        ] },
        { type: 'tool', name: 'read', title: 'Read src/lib/agent.js', meta: 'lines 1–10', duration: 400, output: [
          '1  export async function runAgent({ prompt, signal, emit }) {',
          '2    const plan = await planFor(prompt, { budget: 8 })',
          '3',
          '4    if (signal.aborted) return emit({ type: "done" })',
          '5',
          '6    for (const step of plan) {',
          '7      if (signal.aborted) break',
          '8      await step.run(emit)',
          '9    }',
          '10 }',
        ] },
        { type: 'tool', name: 'bash', title: 'npm test -- --run', meta: 'exit 0 · 0 tests', duration: 900, output: [
          '> kodo@0.0.0 test',
          '> vitest --run',
          '',
          'No test files found, exiting with code 0',
        ] },
        { type: 'text', text: 'Review of the working tree — three things worth your attention.\n\n### 1. `agent.js` — abort is checked, but `done` is skipped\n\n```js\nfor (const step of plan) {\n  if (signal.aborted) break\n  await step.run(emit)\n}\n```\n\nBreaking is correct, but nothing emits a terminal event after the loop, so consumers waiting on `done` hang. Add `emit({ type: "done" })` after the loop.\n\n### 2. `Composer.jsx` — no cleanup on unmount\n\nIf the component unmounts mid-stream, `setMaxHeight` fires on a dead tree. React no longer warns, but it is still wasted work. An `AbortController` in the effect would close the loop.\n\n### 3. `useAutosize.js` — solid\n\nPure function, defensive null check, single place that knows the 168px cap. This is the pattern the rest of the diff should follow.\n\n**Verdict:** ship after the `done` emit. Everything else is a no-blocker nit.' },
      ],
    },
  ],
  verify: [
    {
      reasoning:
        'The ask is narrow: prove the build is healthy. Run the full chain and report exactly what each stage says, without editorializing.',
      steps: [
        { type: 'tool', name: 'bash', title: 'npm run lint', meta: 'exit 0', duration: 800, output: [
          '> oxlint',
          'Found 0 warnings and 0 errors.',
          'Finished in 41ms on 9 files.',
        ] },
        { type: 'tool', name: 'bash', title: 'npm run build', meta: 'exit 0 · 1.2s', duration: 900, output: [
          'vite v8.3.6 building for production...',
          '✓ 42 modules transformed.',
          'dist/index.html                  0.49 kB │ gzip:  0.31 kB',
          'dist/assets/index-4f2a91.css   14.28 kB │ gzip:  4.02 kB',
          'dist/assets/index-b7c31e.js    61.44 kB │ gzip: 21.10 kB',
          '✓ built in 1.19s',
        ] },
        { type: 'text', text: 'Everything is green.\n\n| Stage | Result | Time |\n| --- | --- | --- |\n| `oxlint` | 0 warnings, 0 errors | 41 ms |\n| `vite build` | 42 modules, no warnings | 1.19 s |\n| Bundle | 61.4 kB (21.1 kB gzip) | — |\n\nThe gzip payload is the number to watch. If it creeps past ~40 kB, something large has leaked into the main chunk.' },
      ],
    },
  ],
  build: [
    {
      reasoning:
        'This is an implementation task. First confirm where the seam should live so the new code matches existing conventions, then write it, then verify the build still passes.',
      steps: [
        { type: 'tool', name: 'tool', title: 'grep "useState|useEffect" src', meta: '7 matches in 3 files', duration: 450, output: [
          'src/App.jsx:7            const [sessions, setSessions] = useState([])',
          'src/App.jsx:8            const [active, setActive] = useState(null)',
          'src/components/Composer.jsx:5   const [value, setValue] = useState("")',
          'src/components/Composer.jsx:9   useEffect(() => {',
        ] },
        { type: 'tool', name: 'read', title: 'Read src/App.jsx', meta: 'lines 1–40', duration: 500, output: [
          '1  import { useState } from "react"',
          '2',
          '3  export default function App() {',
          '4    const [sessions, setSessions] = useState([])',
          '5    const [active, setActive] = useState(null)',
          '6',
          '7    function send(prompt) {',
          '8      setSessions((prev) => [...prev, { id: crypto.randomUUID(), prompt }])',
          '9    }',
          '10',
          '11   return <div className="app" />',
          '12 }',
        ] },
        { type: 'tool', name: 'write', title: 'Write src/lib/newFeature.js', meta: '+22 new file', duration: 700, diff: [
          { t: 'add', n: 1, text: 'const KEY = "kodo.sessions.v1"' },
          { t: 'add', n: 2, text: '' },
          { t: 'add', n: 3, text: 'export function loadSessions() {' },
          { t: 'add', n: 4, text: '  try {' },
          { t: 'add', n: 5, text: '    const raw = localStorage.getItem(KEY)' },
          { t: 'add', n: 6, text: '    return raw ? JSON.parse(raw) : []' },
          { t: 'add', n: 7, text: '  } catch {' },
          { t: 'add', n: 8, text: '    return []' },
          { t: 'add', n: 9, text: '  }' },
          { t: 'add', n: 10, text: '}' },
          { t: 'add', n: 11, text: '' },
          { t: 'add', n: 12, text: 'export function saveSessions(sessions) {' },
          { t: 'add', n: 13, text: '  try {' },
          { t: 'add', n: 14, text: '    localStorage.setItem(KEY, JSON.stringify(sessions))' },
          { t: 'add', n: 15, text: '    return true' },
          { t: 'add', n: 16, text: '  } catch {' },
          { t: 'add', n: 17, text: '    return false' },
          { t: 'add', n: 18, text: '  }' },
          { t: 'add', n: 19, text: '}' },
        ] },
        { type: 'tool', name: 'edit', title: 'Edit src/App.jsx', meta: '+9 −2', duration: 700, diff: [
          { t: 'del', n: 1, text: 'import { useState } from "react"' },
          { t: 'add', n: 1, text: 'import { useEffect, useState } from "react"' },
          { t: 'add', n: 2, text: 'import { loadSessions, saveSessions } from "./lib/newFeature"' },
          { t: 'ctx', n: 4, text: 'export default function App() {' },
          { t: 'del', n: 5, text: '  const [sessions, setSessions] = useState([])' },
          { t: 'add', n: 5, text: '  const [sessions, setSessions] = useState(loadSessions)' },
          { t: 'add', n: 6, text: '' },
          { t: 'add', n: 7, text: '  useEffect(() => {' },
          { t: 'add', n: 8, text: '    saveSessions(sessions)' },
          { t: 'add', n: 9, text: '  }, [sessions])' },
        ] },
        { type: 'tool', name: 'bash', title: 'npm run build', meta: 'exit 0 · 1.3s', duration: 1000, output: [
          'vite v8.3.6 building for production...',
          '✓ 43 modules transformed.',
          '✓ built in 1.26s',
        ] },
        { type: 'text', text: 'Done. Sessions now survive a refresh.\n\n**What changed**\n\n- **`src/lib/newFeature.js`** (new) — `loadSessions` / `saveSessions` with `try/catch` around storage. Private-mode browsers throw on write, and corrupt JSON throws on read; both degrade to an empty list.\n- **`src/App.jsx`** — lazy initializer reads once on mount, then a `useEffect` persists on every change.\n\n**Why a lazy initializer** — `useState(loadSessions)` runs the read during render instead of as a second effect, so there is no flash of an empty list on mount.\n\nOne caveat: writes are synchronous and fire on every keystroke-driven change. If sessions grow large, debounce the save (say 300 ms) and flush on `visibilitychange`.' },
      ],
    },
  ],
}

export function buildRun(prompt) {
  const kind = detectKind(prompt)
  return PLANS[kind]
}

export async function runAgent({ prompt, signal, emit }) {
  const kind = detectKind(prompt)
  const plans = PLANS[kind]
  const plan = plans[0]

  emit({ type: 'status', status: 'thinking' })
  emit({ type: 'reasoning-start' })

  const reasoning = plan.reasoning
  for (let i = 0; i < reasoning.length; i += 3) {
    if (signal.aborted) break
    emit({ type: 'reasoning-delta', text: reasoning.slice(i, i + 3) })
    await sleep(9)
  }
  emit({ type: 'reasoning-end' })
  if (signal.aborted) return emit({ type: 'done', aborted: true })

  for (const step of plan.steps) {
    if (signal.aborted) return emit({ type: 'done', aborted: true })

    if (step.type === 'text') {
      emit({ type: 'status', status: 'writing' })
      const id = 'txt-' + Math.random().toString(36).slice(2, 8)
      emit({ type: 'text-start', id })
      const chunks = step.text.match(/[\s\S]{1,4}/g) || []
      for (const c of chunks) {
        if (signal.aborted) break
        emit({ type: 'text-delta', id, text: c })
        await sleep(7)
      }
      emit({ type: 'text-end', id })
      continue
    }

    emit({ type: 'status', status: 'working' })
    const id = 'tool-' + Math.random().toString(36).slice(2, 8)
    emit({ type: 'tool-start', tool: { ...step, id, status: 'running' },
    })
    await sleep(step.duration ? Math.min(step.duration, 1100) : 600)
    if (signal.aborted) {
      emit({ type: 'tool-end', id, status: 'aborted' })
      return emit({ type: 'done', aborted: true })
    }
    emit({ type: 'tool-end', id, status: 'done' })
    await sleep(140)
  }

  emit({ type: 'status', status: 'idle' })
  emit({ type: 'done' })
}

export { changes }
