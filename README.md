# Cambium

A local-first desktop studio for managing **collections of markdown notes and
blog posts** — similar in spirit to Zettlr, rebuilt around a better WYSIWYG
editor and a full publish-to-web pipeline.

```
Write (WYSIWYG markdown) → Organise (frontmatter, templates, links)
→ Connect (git remotes) → Publish (Astro → GitHub Pages / Netlify)
→ See (knowledge graph) → Improve (AI copilot) → Extend (plugins)
```

Built on **Deno Desktop** (`deno desktop`, Deno 2.9+): your Deno code serves the
UI over local HTTP and talks to the embedded webview through fast in-process
bindings. The core domain logic is pure TypeScript shared between backend and
webview, so the same app can later ship as a web app or Tauri binary (see
[concept.md](concept.md)).

## Features

- **WYSIWYG markdown editor** (TipTap/ProseMirror) that round-trips canonical
  markdown to disk, with debounced autosave and Ctrl/Cmd-S
- **Checklists** — GFM task lists (`- [ ]` / `- [x]`) with clickable
  checkboxes, nesting and a toolbar toggle
- **Frontmatter support** — YAML header card above the document with tabbed
  form / raw-YAML editing; drives titles, drafts, tags, slugs and publishing
  metadata
- **Templates** — builtin zettel/blog-post/daily templates plus per-collection
  templates in `.cambium/templates/*.md` with `{{title}} {{date}} {{id}}…`
  variables
- **Git per collection** — init, connect a GitHub/local remote, stage, commit,
  push/pull and history (auth delegated to your own credential helper)
- **Astro publishing** — scaffold an Astro site next to any collection, sync
  notes into its content collection, build via detected package manager, deploy
  to GitHub Pages or Netlify
- **Knowledge graph** — force-directed sigma.js visualisation of `[[wikilinks]]`
  within or across collections; click a node to open the note
- **AI copilot** — bring-your-own-key providers (OpenAI-compatible, Anthropic,
  Ollama) with streaming summarise / critique / research / draft / continue /
  rewrite commands
- **Editor plugins** — registry-based API for fenced-code-block renderers;
  builtin plugins render ABC music scores
  (`abc) and Mermaid diagrams
  (`mermaid) inline — the rendering replaces the
  source unless you're editing the block
- **Syntax highlighting** for fenced code blocks (~40 languages via
  highlight.js/lowlight), theme-aware light & dark palettes. Fence options are
  supported: `ts{1,3-5}` highlights lines 1 and 3–5. Entering a block reveals
  its ``` fence lines; edit the language/options right on the opening fence
  (click, or arrow up from the code) — Enter applies, Esc cancels. The closing
  fence is interactive too: reach it with ↓ from the block's last line (or click
  it) and Enter inserts an empty line below the block — the way to separate two
  adjacent code blocks. ↑/Esc returns to the code; ↓ leaves forward past the
  block.
- Native menus & window management, file watching with live reindex, cross-
  collection search

## Requirements

- [Deno](https://deno.com) **2.9+** (`deno --version`)
- `git` on PATH (for the Git panel)
- For publishing builds: `npm`, `pnpm`, `yarn` or `bun`
- Optional: [Netlify CLI](https://docs.netlify.com/cli/get-started/) for Netlify
  deploys, an LLM API key or local [Ollama](https://ollama.com) for AI features

## Quickstart

```sh
# 1. install dependencies (creates node_modules/)
deno install

# 2a. develop in the browser (backend :8787 + vite :5173, hot reload)
deno task dev
open http://localhost:5173

# 2b. or run as a real desktop app (native window, in-process bindings)
deno task build
deno task desktop
```

First steps in the app:

1. Add a collection via the **⌂** button — paste the absolute path of any folder
   containing `.md` files (native folder pickers are not yet available in
   `deno desktop`; path validation happens server-side)
2. Create notes from templates with **+**, link them with `[[wikilinks]]`, edit
   frontmatter via the Form/YAML tabs above the document
3. Open **Graph** from the toolbar to see the link structure; use the
   **Contents** panel for a clickable outline of the open note
4. Configure AI providers under **⚙ Settings** before using the AI panel
5. To publish: open the **Publish** panel → _Create Astro site_ → _Sync_ →
   _Build_ → set target/repo → _Deploy_

### Package a redistributable binary

```sh
deno task package        # builds dist/ then compiles dist-desktop/<app>
```

## Tasks

| Task                     | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `deno task dev`          | backend (:8787) + vite dev server (:5173) together   |
| `deno task build`        | production UI bundle → `dist/`                       |
| `deno task desktop`      | run the desktop app (build `dist/` first)            |
| `deno task desktop:hmr`  | desktop app with hot module replacement              |
| `deno task package`      | build + compile redistributable into `dist-desktop/` |
| `deno task test`         | core unit tests (`tests/`)                           |
| `deno task check`        | typecheck backend, adapters, core and frontend       |
| `deno task lint` / `fmt` | lint / format                                        |

## Project layout

```
main.ts            shell entry: HTTP serving + desktop window
backend/           rpc method table, api routes (SSE), static files, native window
adapters/          platform capabilities: settings, guarded fs, git CLI, astro
src-core/          pure TypeScript domain logic (no platform imports) — reusable
                   unchanged by future web/Tauri targets
web/               React + Vite frontend (editor, panels, dialogs, transport)
tests/             deno test suite for src-core
```

A **collection** is just a folder of markdown files. Cambium adds only:

```
my-notes/
├── .cambium/
│   ├── collection.json     collection settings
│   └── templates/*.md      collection-local templates
└── …your notes…
```

Your content stays plain, canonical markdown — no lock-in.

## Configuration

App state lives in the OS config dir:

| OS      | Path                                              |
| ------- | ------------------------------------------------- |
| Linux   | `$XDG_CONFIG_HOME/cambium` or `~/.config/cambium` |
| macOS   | `~/Library/Application Support/cambium`           |
| Windows | `%APPDATA%/cambium`                               |

`settings.json` holds registered collections and AI provider configs;
`window.json` remembers window geometry.

## Security notes

- The app's HTTP listener binds to `127.0.0.1` only (enforced by `deno desktop`)
- All filesystem routes guard against paths escaping a collection root
- AI requests go directly from your machine to the configured endpoint; keys are
  stored locally in plaintext for now (OS keychain support is on the roadmap)

## Documentation

Full architecture, subsystem specifications, RPC surface, data flows, milestones
and risk register: **[concept.md](concept.md)**.
