# kodo

A small, local-first coding agent UI. Chat with an agent, watch it read files, edit code, and run commands — in a single window.

Built with React 19 + Vite 8. No Tailwind, no markdown library, no UI kit — about 300 kB of JavaScript and 38 kB of CSS, shipped as a static bundle.

![kodo](https://img.shields.io/badge/status-0.1.0-b7f26b)

## Features

- **Streaming transcript** — reasoning, tool calls, and the final answer stream in as separate parts, with timing and token counts.
- **Tool cards** — shell, read, grep, glob, edit and write each render their own surface; edits and writes expand into inline diffs.
- **Right panel** — working tree with per-file diffs, a file explorer, and a context/token budget view.
- **Command palette** — `⌘K` / `Ctrl+K`, ranked search over sessions, views and appearance.
- **Dark and light** — one set of design tokens, `data-theme` on `<html>`, remembered in `localStorage`.
- **Keyboard first** — `⌘N` new session, `⌘B` toggle panel, `⌘,` settings, `Esc` to dismiss.
- **Responsive** — the sidebar becomes a drawer and the panel becomes an overlay below 1180px / 900px.
- **No dependencies at runtime** — the agent is simulated by a scripted plan engine in `src/lib/agent.js`; swap `runAgent` for a real transport and the UI works unchanged.

## Run it

### Standalone (Windows)

Download `kodo.exe` from [Releases](../../releases), then double-click it. It starts a local server on `127.0.0.1:4173` and opens your browser.

```
kodo.exe                 # default port, opens the browser
kodo.exe --port 8080     # a different port
kodo.exe --no-open       # don't launch a browser
kodo.exe --host 0.0.0.0  # bind to all interfaces
```

The executable is a Node.js single-executable application (SEA) with the built assets embedded — no install, no `node_modules`, nothing written to disk.

### From source

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
npm start        # serve dist/ at http://127.0.0.1:4173
npm run exe      # build and package release/kodo.exe
npm run lint     # oxlint
```

Building the `.exe` requires Node.js 26 or newer, which added `node --build-sea`.

## Layout

```
server/main.cjs          static file server; reads assets from the SEA blob or dist/
scripts/build-exe.mjs    bundles dist/ into a Node SEA → release/kodo.exe
src/App.jsx              shell, session state, agent event handling, shortcuts
src/lib/agent.js         scripted plans (explain / fix / review / verify / build)
src/lib/markdown.jsx     dependency-free markdown renderer
src/lib/workspace.js     seeded sessions, files, changes, models
src/components/          Sidebar, Composer, Message, ToolCard, Diff,
                         RightPanel, CommandPalette, Settings, Icon
src/styles/              tokens + one partial per surface
```

The agent contract is a single function:

```js
await runAgent({ prompt, signal, emit })
```

`emit` receives `status`, `reasoning-start|delta|end`, `text-start|delta|end`,
`tool-start|end`, and `done`. `App.jsx` folds those events into message parts,
so a real backend only has to speak the same event shape.

## License

[The Unlicense](LICENSE) — public domain. Do whatever you want with it.
