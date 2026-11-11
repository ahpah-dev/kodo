export const workspace = {
  name: 'kodo',
  path: '~/dev/kodo',
  branch: 'main',
  ahead: 2,
}

export const files = [
  {
    path: 'src',
    kind: 'dir',
    children: [
      {
        path: 'src/components',
        kind: 'dir',
        children: [
          { path: 'src/components/Composer.jsx', kind: 'file', size: '4.2 KB', status: 'M' },
          { path: 'src/components/Message.jsx', kind: 'file', size: '2.8 KB' },
          { path: 'src/components/Sidebar.jsx', kind: 'file', size: '3.1 KB' },
          { path: 'src/components/ToolCard.jsx', kind: 'file', size: '2.2 KB' },
        ],
      },
      {
        path: 'src/lib',
        kind: 'dir',
        children: [
          { path: 'src/lib/agent.js', kind: 'file', size: '5.6 KB', status: 'M' },
          { path: 'src/lib/format.js', kind: 'file', size: '1.1 KB' },
          { path: 'src/lib/useAutosize.js', kind: 'file', size: '0.9 KB', status: 'A' },
        ],
      },
      { path: 'src/App.jsx', kind: 'file', size: '6.4 KB', status: 'M' },
      { path: 'src/index.css', kind: 'file', size: '14 KB' },
      { path: 'src/main.jsx', kind: 'file', size: '0.3 KB' },
    ],
  },
  { path: 'public', kind: 'dir', children: [{ path: 'public/favicon.svg', kind: 'file', size: '1.2 KB' }] },
  { path: 'index.html', kind: 'file', size: '0.7 KB' },
  { path: 'package.json', kind: 'file', size: '0.6 KB' },
  { path: 'vite.config.js', kind: 'file', size: '0.2 KB' },
  { path: 'README.md', kind: 'file', size: '1.9 KB' },
]

export const flatFiles = files.flatMap(function walk(node) {
  const self = node.kind === 'file' ? [node] : []
  const kids = node.children ? node.children.flatMap(walk) : []
  return self.concat(kids)
})

export const changes = [
  {
    path: 'src/components/Composer.jsx',
    adds: 18,
    dels: 7,
    diff: [
      { t: 'ctx', n: 1, text: "import { useEffect, useRef, useState } from 'react'" },
      { t: 'add', n: 2, text: "import { autosize } from '../lib/useAutosize'" },
      { t: 'ctx', n: 3, text: '' },
      { t: 'ctx', n: 4, text: 'export function Composer({ onSend, busy }) {' },
      { t: 'ctx', n: 5, text: '  const ref = useRef(null)' },
      { t: 'del', n: 6, text: '  const [rows, setRows] = useState(1)' },
      { t: 'add', n: 6, text: '  const [maxHeight, setMaxHeight] = useState(0)' },
      { t: 'ctx', n: 7, text: '  const [value, setValue] = useState("")' },
      { t: 'ctx', n: 8, text: '' },
      { t: 'del', n: 9, text: '  useEffect(() => {' },
      { t: 'del', n: 10, text: '    setRows(value.split("\\n").length)' },
      { t: 'del', n: 11, text: '  }, [value])' },
      { t: 'add', n: 9, text: '  useEffect(() => {' },
      { t: 'add', n: 10, text: '    const el = ref.current' },
      { t: 'add', n: 11, text: '    if (!el) return' },
      { t: 'add', n: 12, text: '' },
      { t: 'add', n: 13, text: '    el.style.height = "auto"' },
      { t: 'add', n: 14, text: '    const next = Math.min(el.scrollHeight, 168)' },
      { t: 'add', n: 15, text: '    el.style.height = next + "px"' },
      { t: 'add', n: 16, text: '    setMaxHeight(next >= 168 ? 168 : 0)' },
      { t: 'add', n: 17, text: '  }, [value])' },
      { t: 'ctx', n: 18, text: '' },
      { t: 'ctx', n: 19, text: '  return (' },
      { t: 'del', n: 20, text: '    <textarea ref={ref} rows={Math.min(rows, 3)} />' },
      { t: 'add', n: 20, text: '    <textarea' },
      { t: 'add', n: 21, text: '      ref={ref}' },
      { t: 'add', n: 22, text: '      rows={1}' },
      { t: 'add', n: 23, text: '      style={{ overflowY: maxHeight ? "auto" : "hidden" }}' },
      { t: 'add', n: 24, text: '    />' },
      { t: 'ctx', n: 25, text: '  )' },
      { t: 'ctx', n: 26, text: '}' },
    ],
  },
  {
    path: 'src/lib/useAutosize.js',
    adds: 14,
    dels: 0,
    diff: [
      { t: 'add', n: 1, text: 'export function autosize(el, max = 168) {' },
      { t: 'add', n: 2, text: '  if (!el) return { height: 0, scroll: false }' },
      { t: 'add', n: 3, text: '' },
      { t: 'add', n: 4, text: '  el.style.height = "auto"' },
      { t: 'add', n: 5, text: '  const next = Math.min(el.scrollHeight, max)' },
      { t: 'add', n: 6, text: '  el.style.height = `${next}px`' },
      { t: 'add', n: 7, text: '' },
      { t: 'add', n: 8, text: '  return { height: next, scroll: next >= max }' },
      { t: 'add', n: 9, text: '}' },
    ],
  },
  {
    path: 'src/lib/agent.js',
    adds: 9,
    dels: 3,
    diff: [
      { t: 'ctx', n: 1, text: 'export async function runAgent({ prompt, signal, emit }) {' },
      { t: 'del', n: 2, text: '  const plan = await planFor(prompt)' },
      { t: 'add', n: 2, text: '  const plan = await planFor(prompt, { budget: 8 })' },
      { t: 'ctx', n: 3, text: '' },
      { t: 'add', n: 4, text: '  if (signal.aborted) return emit({ type: "done" })' },
      { t: 'ctx', n: 5, text: '' },
      { t: 'ctx', n: 6, text: '  for (const step of plan) {' },
      { t: 'del', n: 7, text: '    await step.run(emit)' },
      { t: 'add', n: 7, text: '    if (signal.aborted) break' },
      { t: 'add', n: 8, text: '    await step.run(emit)' },
      { t: 'ctx', n: 9, text: '  }' },
      { t: 'ctx', n: 10, text: '}' },
    ],
  },
]

export const models = [
  { id: 'kodo-mini', name: 'Kodo Mini', provider: 'Local', ctx: '128k', tone: 'green' },
  { id: 'kodo-pro', name: 'Kodo Pro', provider: 'Local', ctx: '200k', tone: 'green' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic', ctx: '200k', tone: 'amber' },
  { id: 'gpt-reason', name: 'GPT Reason', provider: 'OpenAI', ctx: '400k', tone: 'violet' },
]

const SESSION_SEED = [
  {
    id: 's-1',
    title: 'Fix composer autosize on Firefox',
    updated: 'Just now',
    model: 'kodo-pro',
    tokens: 18420,
    messageCount: 2,
    messages: [
      {
        id: 'm-1',
        role: 'user',
        time: '2:41 PM',
        content:
          'The composer stops growing after 3 lines in Firefox. Fix the autosize logic and make sure it still works when rendered on the server.',
      },
      {
        id: 'm-2',
        role: 'assistant',
        time: '2:41 PM',
        model: 'kodo-pro',
        parts: [
          {
            type: 'reasoning',
            text: 'The current implementation derives row count from newline characters, so it never accounts for wrapped text. Firefox also measures scrollHeight before the style recalculation settles, which is why growth stalls. I should measure the element directly, cap it, and guard for a missing ref during SSR.',
          },
          {
            type: 'tool',
            id: 't-1',
            name: 'grep',
            title: 'grep "rows=" src',
            status: 'done',
            meta: '3 matches in 1 file',
            output: [
              'src/components/Composer.jsx:20  rows={Math.min(rows, 3)}',
              'src/components/Composer.jsx:6   const [rows, setRows] = useState(1)',
              'src/components/Composer.jsx:10  setRows(value.split("\\n").length)',
            ],
          },
          {
            type: 'tool',
            id: 't-2',
            name: 'read',
            title: 'Read src/components/Composer.jsx',
            status: 'done',
            meta: 'lines 1–24',
            output: [
              "1  import { useEffect, useRef, useState } from 'react'",
              '2',
              '3  export function Composer({ onSend, busy }) {',
              '4    const ref = useRef(null)',
              '5    const [rows, setRows] = useState(1)',
              '6    const [value, setValue] = useState("")',
              '7',
              '8    useEffect(() => {',
              '9      setRows(value.split("\\n").length)',
              '10   }, [value])',
              '11',
              '12   return <textarea ref={ref} rows={Math.min(rows, 3)} />',
              '13 }',
            ],
          },
          {
            type: 'text',
            text: "Found it. Row counting only reflects explicit newlines, so wrapped lines are invisible to the layout. I'm switching to a measured height with a cap, and returning early when the ref isn't attached (SSR-safe).",
          },
          {
            type: 'tool',
            id: 't-3',
            name: 'edit',
            title: 'Edit src/components/Composer.jsx',
            status: 'done',
            meta: '+18 −7',
            diff: changes[0].diff,
          },
          {
            type: 'tool',
            id: 't-4',
            name: 'write',
            title: 'Write src/lib/useAutosize.js',
            status: 'done',
            meta: '+14 new file',
            diff: changes[1].diff,
          },
          {
            type: 'tool',
            id: 't-5',
            name: 'bash',
            title: 'npm run build',
            status: 'done',
            meta: 'exit 0 · 1.2s',
            output: [
              'vite v8.3.6 building for production...',
              '✓ 42 modules transformed.',
              'dist/assets/index-Ck2p9f.css   14.28 kB │ gzip: 4.02 kB',
              'dist/assets/index-Bd81xq.js    61.44 kB │ gzip: 21.10 kB',
              '✓ built in 1.21s',
            ],
          },
          {
            type: 'text',
            text: 'Fixed. The composer now measures `scrollHeight` on every change and caps at 168px before switching to a scrollbar.\n\n- Replaced newline counting with a real measurement pass\n- Added an early return so SSR renders don\'t touch `ref.current`\n- Capped growth at 6 lines, then `overflow-y: auto`\n\nBuild passes clean. Want me to add a regression test for wrapped input?',
          },
        ],
      },
    ],
  },
  {
    id: 's-2',
    title: 'Add session search to the sidebar',
    updated: '12m ago',
    model: 'claude-sonnet',
    tokens: 9200,
    messageCount: 6,
    messages: [],
  },
  {
    id: 's-3',
    title: 'Why is the bundle 240kb?',
    updated: '1h ago',
    model: 'kodo-mini',
    tokens: 4300,
    messageCount: 4,
    messages: [],
  },
  {
    id: 's-4',
    title: 'Write a release script',
    updated: 'Yesterday',
    model: 'gpt-reason',
    tokens: 15600,
    messageCount: 8,
    messages: [],
  },
  {
    id: 's-5',
    title: 'Tokens for the editor theme',
    updated: 'Tue',
    model: 'kodo-mini',
    tokens: 2100,
    messageCount: 3,
    messages: [],
  },
]

export function createInitialSessions() {
  return SESSION_SEED.map((s) => ({ ...s, messages: s.messages.slice() }))
}

export const suggestions = [
  { label: 'Explain this codebase', hint: 'map the architecture in 60 seconds', icon: 'compass' },
  { label: 'Fix a failing test', hint: 'run, trace, patch, verify', icon: 'wand' },
  { label: 'Add a feature', hint: 'plan, edit, build', icon: 'sparkles' },
  { label: 'Review my changes', hint: 'diff-aware code review', icon: 'diff' },
]
