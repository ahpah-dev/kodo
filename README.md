# kodo

A small, local-first coding agent. Bring your own model — API key or OAuth — and watch it read files, edit code, and run commands in your project, in a single window.

Built with React 19 + Vite 8 and a zero-dependency Node server. No Tailwind, no markdown library, no UI kit, no provider SDKs.

![kodo](https://img.shields.io/badge/version-0.2.0-b7f26b)

## Features

- **Streaming transcript** — reasoning, tool calls, and the final answer stream in as separate parts, with timing and token counts.
- **Tool cards** — shell, read, grep, glob, edit and write each render their own surface; edits and writes expand into inline diffs.
- **Right panel** — working tree with per-file diffs, a file explorer, and a context/token budget view.
- **Command palette** — `⌘K` / `Ctrl+K`, ranked search over sessions, views and appearance.
- **Dark and light** — one set of design tokens, `data-theme` on `<html>`, remembered in `localStorage`.
- **Keyboard first** — `⌘N` new session, `⌘B` toggle panel, `⌘,` settings, `Esc` to dismiss.
- **Responsive** — the sidebar becomes a drawer and the panel becomes an overlay below 1180px / 900px.
- **Real models, your keys** — Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, or any OpenAI-/Anthropic-compatible endpoint. Model lists are fetched live from each provider.
- **Real agent** — the server runs a tool-use loop (read, glob, grep, edit, write, bash) confined to your workspace folder. Edits and shell commands ask for approval (shown as a diff or the exact command) unless you turn on auto-approve.
- **Live workspace** — the Changes panel is `git diff` of your actual repo, with a working commit box; the file tree is your real folder.

## Models and sign-in

Open **Settings** and pick one:

| Provider | Sign-in |
| --- | --- |
| Anthropic, OpenAI, Google Gemini | API key (BYOK) |
| OpenRouter | **OAuth (PKCE)** one-click sign-in, or API key |
| Ollama | none — local server, default `http://localhost:11434` |
| Custom | any OpenAI- or Anthropic-compatible base URL, with an API key or **generic OAuth 2.0 (PKCE)** using your own client ID, authorize/token URLs and scopes (register `http://127.0.0.1:4173/oauth/callback` as the redirect URI) |

Keys can also come from `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` / `GOOGLE_API_KEY` and `OPENROUTER_API_KEY`.
Credentials are saved to `~/.kodo/config.json` (mode 0600, override the folder with `KODO_HOME`), never returned to the browser, and only sent to the provider you configured. Requests go from the local kodo server straight to the provider.

Consumer subscription logins (Claude.ai, ChatGPT) are intentionally not offered: those providers don't allow third-party apps to use them.

## Run it

### Standalone (Windows)

Download `kodo.exe` from [Releases](../../releases), then double-click it. It starts a local server on `127.0.0.1:4173` and opens your browser.

```
kodo.exe                 # default port, opens the browser
kodo.exe --dir C:path	oproject   # workspace the agent may edit (default: current folder)
kodo.exe --port 8080     # a different port
kodo.exe --no-open       # don't launch a browser
kodo.exe --host 0.0.0.0  # bind to all interfaces (requires the access-token URL it prints)
```

The executable is a Node.js single-executable application (SEA) with the built assets embedded — no install, no `node_modules`, nothing written to disk.

### From source

```bash
npm install
npm run dev:server   # API on 127.0.0.1:4173 (needs no build with --api-only)
npm run dev          # UI on http://localhost:5173, proxied to the API
npm run build    # static output in dist/
npm start        # serve dist/ at http://127.0.0.1:4173
npm run exe      # build and package release/kodo.exe
npm run lint     # oxlint
```

Building the `.exe` requires Node.js 26 or newer, which added `node --build-sea`.

## Layout

```
server/main.cjs          HTTP server: static assets, JSON API, OAuth callback, origin/host guard
server/providers.cjs     provider presets, model listing, OAuth, Anthropic + OpenAI-style streaming
server/agent.cjs         the agent loop and approval gate
server/tools.cjs         read / glob / grep / edit / write / bash
server/workspace.cjs     path safety, line diffs, git status/diff/commit, file tree
server/config.cjs        ~/.kodo/config.json
scripts/build-exe.mjs    bundles server + dist/ into a Node SEA → release/kodo.exe
src/App.jsx              shell, sessions (persisted in localStorage), event handling
src/lib/agent.js         client for the streaming /api/chat endpoint
src/components/          Sidebar, Composer, Message, ToolCard, Diff,
                         RightPanel, CommandPalette, Settings, Icon
```

The agent stream is newline-delimited JSON: `status`, `reasoning-*`, `text-*`, `tool-start`, `tool-update`, `tool-end`, `usage`, `error`, `done`. `App.jsx` folds those into message parts.

## Safety

- The API only answers same-origin requests on loopback hosts (blocks cross-site and DNS-rebinding attacks).
- File tools can't leave the workspace folder. Shell commands run with your user's permissions, so keep approvals on for untrusted projects and prompts.
- `AGENTS.md` / `CLAUDE.md` in the workspace root is added to the system prompt.

## License

[The Unlicense](LICENSE) — public domain. Do whatever you want with it.
