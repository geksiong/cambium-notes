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
- **Pandoc-safe saving** — files written for Pandoc (e.g. libromorph books)
  survive editing: math `$…$`/`$$…$$`, bracketed spans `[x]{.cls}`, fenced
  divs `::: note`, footnotes, citations, sub/superscript, definition lists,
  line blocks, fancy lists, all table kinds, raw TeX and HTML are preserved —
  saving never changes how Pandoc or CommonMark renders the file. Constructs
  without a rich editor view show as editable source.
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
  and Markdown links to other notes (`[see](../intro.md#setup)`, resolved
  relative to the linking note, as Pandoc and libromorph do) within or across
  collections; click a node to open the note
- **AI copilot** — bring-your-own-key providers (OpenAI-compatible, Anthropic,
  Ollama) with streaming summarise / critique / research / draft / continue /
  rewrite commands
- **Editor plugins** — registry-based API for fenced-code-block renderers
  (`"below"` mode shows output under the live source; `"inline"` mode replaces
  the source until you edit the block). Renderers receive the verbatim fence
  info string, so blocks can take options. Builtin plugins render inline:
  - ABC music scores (` ```abc `), with playback controls (play/pause, loop,
    restart, progress, tempo) that highlight notes as they sound
  - Mermaid diagrams (` ```mermaid `)
  - libromorph rhythm grids (` ```rhythm-grid `): box-notation tables, or a
    clock face with `.circle`; a grid with `tempo=` plays as percussion
    (`play`, `repeat`, `sound`, `count-in` as in libromorph) with the sounding
    column highlighted
  - guitar diagrams: chord shapes (` ```chord `), fretboard.js scales and
    positions (` ```fretboard `, scale dots named with ♭/♯) and Fretdrom boxes
    (` ```fretdrom `), bundled so they work offline

  Only one score or grid plays at a time. Renderers match the fence's base
  language, so ` ```mermaid {1-3} ` still renders, and Pandoc attribute
  fences use their first class: ` ```{.rhythm-grid .circle title="…"} `.
- **Fenced code blocks** (` ``` ` or `~~~`) with **Shiki** syntax highlighting
  — every Shiki-bundled language, loaded lazily on first use; unknown languages
  stay plain — and theme-aware light & dark palettes. The opening-fence info
  string is stored verbatim, so it round-trips unchanged, and is parsed with
  Expressive Code's own grammar — the same one the Astro site renders with:
  - line highlights `ts {1, 4, 7-8}` (legacy `ts{1,3-5}` also accepted),
    `mark={…}`, `ins={…}`, `del={…}`, labelled ranges `{"A":6-10}` and column
    ranges `{6-7:8-10}`
  - inline text markers `"search me"` and `/re[gx]/` (optionally typed, e.g.
    `ins="…"`)
  - `title="demo.ts"` (shown beside the language chip) and `wrap` / `!wrap`
  - ` ```diff ` blocks render `+`/`-` lines as ins/del; add `lang="ts"` to keep
    syntax colours
  - publish-only options (frames, collapse, preserveIndent…) are kept but have
    no live preview
- **Code block editing** — double-click the language chip to change the
  language. Entering a block reveals its fence lines; edit the language/options
  right on the opening fence (click, or arrow up from the code) — Enter applies,
  Esc cancels. The closing fence is interactive too: reach it with ↓ from the
  block's last line (or click it) and Enter inserts an empty line below the
  block — the way to separate two adjacent code blocks. ↑/Esc returns to the
  code; ↓ leaves forward past the block. Pasting fenced markdown into a block
  strips the fences instead of nesting them.
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
