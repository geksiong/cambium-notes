# Cambium — Concept & Solution Specification

**Cambium** is a local-first desktop studio for managing **collections of
markdown notes and blog posts** — in the spirit of Zettlr, rebuilt around a
better editing experience and a full publish-to-web pipeline.

```
Write (WYSIWYG markdown) → Organise (frontmatter, templates, links)
→ Connect (git remotes) → Publish (Astro → GitHub Pages / Netlify)
→ See (knowledge graph) → Improve (AI copilot) → Extend (plugins)
```

---

## 1. Goals & differentiators vs Zettlr

| Area          | Zettlr                                     | Cambium                                                                                       |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Editor        | Source-highlighted + limited preview modes | True WYSIWYG (ProseMirror/TipTap) that round-trips canonical markdown to disk                 |
| Frontmatter   | Displayed, weakly editable                 | First-class: schema-aware panel, used by templates, graph, publishing                         |
| Templates     | Snippets                                   | Whole-file templates with variable interpolation (`{{title}}`, `{{date}}`, zettel IDs)        |
| VCS           | None built-in                              | Per-collection git: init, connect GitHub/local remote, stage/commit/push/pull/log UI          |
| Publishing    | Export dialogs                             | Integrated Astro site generation per collection → GitHub Pages or Netlify                     |
| Graph         | Single-vault                               | Knowledge graph across _and_ within collections, scope toggle, click-to-open                  |
| AI            | None                                       | BYO-key copilot: draft / research / summarise / critique / continue / rewrite, streaming      |
| Extensibility | Limited                                    | Plugin API for editor extensions; first plugin renders ABC music scores in fenced code blocks |
| Runtime       | Electron (heavy)                           | Deno Desktop (system webview, single binary, cross-compilable), portable core                 |

### Non-goals (v0)

- Mobile, real-time collaboration (CRDT), PDF/Office export, citation-manager
  integration (Zotero), sync services. All are roadmap items (§13).

---

## 2. Architecture

Three strictly layered tiers. Portability is enforced by an import rule:
**`src-core/` may not import from `adapters/`, `backend/`, `web/`, or any
platform API** (no `Deno.*`). It is shared verbatim by backend and webview.

```
┌────────────────────────────────────────────────────────────────────┐
│ SHELL  main.ts — deno desktop entry                                │
│   Deno.serve() ── static UI + /api/rpc/* + /api/ai/stream (SSE)    │
│   BrowserWindow: geometry restore, native app menu, fs watcher     │
│   win.bind(...)  ←→  bindings.<method>()   (in-process RPC)        │
├────────────────────────────────────────────────────────────────────┤
│ ADAPTERS  adapters/ — platform capabilities behind interfaces      │
│   settings.deno · fs.deno · git.cli · astro.publisher              │
│   (future: settings.tauri, git.isomorphic, browser FS Access)      │
├────────────────────────────────────────────────────────────────────┤
│ CORE  src-core/ — pure TypeScript domain logic (isomorphic)        │
│   frontmatter · links · graph · templates · search · ids           │
│   ai/{providers,commands} · plugins/types                          │
└────────────────────────────────────────────────────────────────────┘
          ▲                                        ▲
          │ fetch('/api/rpc/…')                    │ bindings.*()
          └──────────── WEBVIEW (web/, React+Vite) ┘
                        transport.ts picks bindings when present,
                        falls back to HTTP → same code runs in a browser
```

**Transport duality** is what makes the future web-app/Tauri ports cheap:

| Target          | Shell                   | Core   | Adapters                      | Transport                                        |
| --------------- | ----------------------- | ------ | ----------------------------- | ------------------------------------------------ |
| Desktop (today) | `deno desktop` binary   | shared | Deno implementations          | `bindings.*()` + SSE for AI streams              |
| Web (later)     | Deno Deploy / self-host | shared | server-side Deno (same files) | HTTP only                                        |
| Tauri (later)   | Tauri shell             | shared | Rust `invoke()` bridge        | `window.__TAURI__` shim of the same method table |

The entire backend RPC surface is one typed method map (`backend/methods.ts`);
it is registered three ways: as `win.bind` handlers, as `/api/rpc/:method`
routes, and (later) as the Tauri command table.

---

## 3. Technology choices

| Concern         | Choice                                                  | Rationale                                                                                                                                |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/shell   | **Deno Desktop 2.9**, `webview` backend                 | Small binaries, npm compat, in-process bindings, HMR dev, auto-update story; CEF backend opt-in if pixel-identical rendering ever needed |
| UI              | **React 18 + Vite 5** (SPA, prebuilt to `dist/`)        | Mature ecosystem; Vite output served by our own `Deno.serve`, so no framework lock-in                                                    |
| State           | **zustand**                                             | Minimal boilerplate for document/tab/graph state                                                                                         |
| Editor          | **TipTap v2 (ProseMirror)** + `tiptap-markdown`         | Best extension model for WYSIWYG-with-canonical-markdown; custom NodeViews power code-block renderers                                    |
| YAML            | `yaml` (npm)                                            | Isomorphic (works in core for both realms)                                                                                               |
| Graph           | **sigma.js v3 + graphology (+forceatlas2)**             | Same engine class Obsidian uses; fast for thousands of nodes                                                                             |
| AI              | Provider adapters: OpenAI-compatible, Anthropic, Ollama | BYO key/model; streaming via SSE endpoint                                                                                                |
| Music rendering | **abcjs** (builtin plugin)                              | Proves the plugin API end-to-end                                                                                                         |
| Git             | System `git` CLI via adapter                            | Zero vendored crypto/auth pain; users' credential helpers just work. isomorphic-git adapter reserved for the browser target              |
| Publishing      | Embedded Astro starter + package-manager detection      | Collection stays plain markdown; site dir is disposable/regenerable                                                                      |
| Tests           | `deno test` (std asserts)                               | Fast, no extra deps                                                                                                                      |

---

## 4. Repository layout

```
cambium/
├── concept.md               ← this document
├── deno.json                ← tasks, imports, compilerOptions, desktop block
├── tsconfig.json            ← JSX automatic runtime settings for Vite/esbuild
├── vite.config.ts           ← root=web/, build→dist/, /api proxy for dev
├── dev.ts                   ← dev orchestrator (backend + vite together)
├── main.ts                  ← shell entry (serve + window)
├── backend/
│   ├── methods.ts           ← THE rpc surface: {name: handler}
│   ├── api.ts               ← /api/rpc/:method, /ai/stream (SSE), CORS
│   ├── bindings.ts          ← registers methods as win.bind handlers
│   ├── static.ts            ← dist/ assets + SPA fallback
│   ├── window.ts            ← BrowserWindow, menu, watcher→webview events
│   └── desktop-shim.ts      ← narrow types until upstream BrowserWindow types land
├── adapters/
│   ├── settings.ts          ← app data dir persistence (atomic writes)
│   ├── workspace.ts         ← guarded fs ops (path traversal safe), tree scan, index
│   ├── git.ts               ← GitService over system git CLI
│   └── astro.ts             ← starter scaffold, sync, build, deploy targets
├── src-core/                ← pure TS (no platform imports)
│   ├── types.ts  frontmatter.ts  links.ts  graph.ts
│   ├── templates.ts  ids.ts  search.ts
│   ├── ai/providers.ts  ai/commands.ts
│   └── plugins/types.ts     ← plugin manifest/API contracts
├── tests/                   ← deno test suite for src-core (21 tests)
└── web/
    ├── index.html  main.tsx  App.tsx  styles.css
    ├── transport.ts         ← bindings-or-fetch rpc client
    ├── state/store.ts       ← zustand store
    ├── editor/extensions.ts ← TipTap setup + markdown round-trip
    ├── editor/codeRenderers.ts ← plugin registry impl (ABC builtin)
    ├── plugins/builtin-abc.ts
    └── components/          ← Explorer, EditorPane, FrontmatterPanel,
                                GraphView, AiPanel, GitPanel, PublishPanel,
                                TemplatesDialog, SettingsDialog (+AddCollection)
```

A collection (user content) looks like:

```
my-notes/                 ← registered as a Cambium collection
├── .cambium/
│   ├── collection.json   ← id, name, zettel format, publish profile
│   └── templates/*.md    ← collection-local templates
├── notes/…  posts/…      ← free-form markdown tree
└── .git/                 ← optional, managed via Git panel
```

---

## 5. Domain model (src-core/types.ts)

```ts
type FrontMatter = Record<string, unknown>;

interface NoteRef { // index-level record (no body kept)
  path: string; // posix, relative to collection root
  title: string; // fm.title ?? basename
  fm: FrontMatter;
  tags: string[];
  links: string[]; // raw [[wikilink]] targets
  mtime: number;
  collectionId: string;
}

interface CollectionConfig {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  templateDir?: string; // default ".cambium/templates"
  idFormat?: "zettel" | "timestamp" | "none";
  publish?: PublishProfile;
}

interface PublishProfile {
  enabled: boolean;
  mode: "adjacent-site"; // v1: sibling dir <collection>-site
  contentDir: string; // astro content collection path
  target: "github-pages" | "netlify";
  repoUrl?: string; // remote for gh-pages push
  netlifySite?: string; // --site id/name for netlify CLI
}

interface AppSettings {
  collections: CollectionConfig[];
  authorName: string;
  aiProviders: AiProviderConfig[]; // {id,name,type,baseUrl,apiKey?,model}
  activeProviderId?: string;
}

interface GraphData {
  nodes: {
    id: string;
    label: string;
    collectionId: string;
    degree: number;
    tags: string[];
  }[];
  edges: { source: string; target: string }[];
}
```

Notes on disk are **always canonical markdown**: YAML frontmatter block + body.
The app never stores editor-specific markup.

---

## 6. Subsystems

### 6.1 Workspace & collections

- Collections are ordinary directories registered in `settings.json` (app-data
  dir per OS). Native folder pickers aren't exposed by `deno
  desktop` yet →
  path input, validated backend-side (`collections.add`), plus recent-collection
  quick open.
- All fs operations resolve through a guard that rejects paths escaping the
  collection root (no `../` traversal from the webview).
- Watcher: one recursive `Deno.watchFs` per open collection (debounced 500 ms)
  reindexes changed subtrees and pings the webview via
  `executeJs("dispatchEvent(new CustomEvent('cambium:index-changed'))")`.

### 6.2 Markdown & frontmatter

- Splitter supports `--- … ---` (YAML) with tolerant parsing; stringify
  preserves field order and user formatting where possible.
- Frontmatter drives: title fallback, `draft: true` (excluded from publish),
  `slug`, `date`, `tags`, `template`, arbitrary fields surfaced in the panel.
- The frontmatter panel edits values through the parsed object and rewrites only
  the header on save — body text is untouched, so diffs stay small.

### 6.3 WYSIWYG editor

- TipTap StarterKit + Link + `tiptap-markdown` (`html:false` — pure markdown
  serialization).
- Load: read file → split fm/body → `editor.commands.setContent(body)`.
- Save: `editor.storage.markdown.getMarkdown()` → recompose with frontmatter →
  debounced autosave (600 ms idle) + Ctrl/Cmd-S.
- Known trade-off (documented): lossy round-trips for exotic constructs (raw
  HTML blocks, footnotes) — mitigated by keeping the original file on disk until
  first edit, and an "Edit source" toggle planned M1.

### 6.4 Templates

- Builtin templates ship in-app (blank / zettel / blog post / daily);
  per-collection templates live in `.cambium/templates/*.md`.
- Interpolation: `{{title}} {{date}} {{time}} {{id}} {{author}}` plus any
  dialog-supplied vars. `{{id}}` honours the collection's `idFormat` (zettel =
  `YYYYMMDDHHmm`). Applying a template always yields standard metadata
  frontmatter merged over template-declared fields.
- "New note" flow: pick template → fill vars → choose folder → create & open.

### 6.5 Links & knowledge graph

- Wikilinks `[[target]]`, `[[target#heading]]`, `[[target|label]]`; tags inline
  `#tag` (code fences stripped) and `fm.tags`.
- Resolution: exact relpath match → path suffix → basename → slugified basename;
  always resolves to a canonical note path.
- Edges are explicit links (deduped); tag-similarity edges are a later toggle.
  Scope selector: _this collection_ / _all collections_.
- Rendering: graphology graph → forceatlas2 warm-up → sigma.js canvas; node
  colour = collection hash, size = degree; click opens the note.

### 6.6 Search

- In-memory scoring search rebuilt on watch events: title prefix > title
  substring > tag match > body frequency. Powers the explorer filter box;
  command-palette UX scheduled later on the same service (`search.query`).

### 6.7 Git integration

- Adapter shells out to system `git` (`--porcelain=v1`, `%H|%an|%at|%s` log
  format). Operations:
  `status/init/stageAll/commit/log/push/pull/
  setRemote/currentBranch`.
- Connecting a collection: `git init` (if needed) → set `origin` URL. Auth
  delegates entirely to the user's configured credential helper (`gh auth`, SSH
  agent, store) — Cambium never handles credentials itself.
- Status badges in the Git panel; commit/push/pull buttons; history list with
  relative timestamps.

### 6.8 Publishing pipeline (Astro)

```
[collection *.md] --publish.sync-->  <collection>-site/src/content/posts/*.md
                                     (fm normalised: title/date/slug/draft/tags,
                                      [[wikilinks]] → /posts/<slug>/ links,
                                      draft:true skipped unless includeDrafts)
                 --publish.build-->  package manager detected (npm/pnpm/yarn/bun)
                                     → `pm install` (first time) → `pm run build`
                 --deploy----------> github-pages: orphan `gh-pages` clone in temp dir
                                      ← dist/ contents, commit + push to repoUrl
                                    netlify: `netlify deploy --prod --dir dist`
                                      (requires Netlify CLI login)
```

- The embedded starter is a minimal Astro v5 static blog (content collections
  with glob loader, post list, post pages) written into `<collection>-site/` on
  first use; it is user-owned afterwards and never overwritten silently.
- Long operations run with generous timeouts and return captured output shown
  verbatim in the Publish panel log.

### 6.9 AI subsystem

- Providers are configured in Settings: type `openai-compatible` (works for
  OpenAI, LM Studio, OpenRouter…), `anthropic`, or `ollama`. Keys are stored
  locally in `settings.json` for now (plaintext, flagged in UI); OS keychain
  integration is M4 (§13).
- Commands (`src-core/ai/commands.ts`) are prompt recipes over a context bundle:
  `selection`, `note`, or `note+backlinks`:
  `summarize · critique · research · draft · continue · rewrite`.
- Streaming: `POST /api/ai/stream` returns SSE (`data:{delta}` / `data:[END]`).
  This deliberately bypasses bindings (request/response only) and works
  identically in the browser target.
- Results land in the AI panel with _Insert at cursor_ / _Replace note body_
  actions. Nothing is sent anywhere until the user runs a command; the effective
  prompt is visible/editable before sending.

### 6.10 Plugin system (editor)

Contract (`src-core/plugins/types.ts`):

```ts
interface CambiumPluginContext {
  registerCodeRenderer(lang: string, r: CodeRenderer): void; // fenced blocks
  registerExtension(ext: unknown): void; // raw TipTap extension
  registerToolbar(item: ToolbarItem): void;
}
interface CambiumPlugin {
  name: string;
  version: string;
  setup(ctx: CambiumPluginContext): void;
}
```

- Builtin plugins ship inside the app; user plugins load from
  `.cambium/plugins/*.mjs` (dynamic import in the webview; sandboxing is a
  documented risk, §14).
- **Code renderers:** a renderer may set `mode: "inline"` — its output then
  replaces the block's source while it is not being edited (click to reveal the
  source); the default `"below"` keeps source and output stacked.
- **Reference plugin — ABC scores:** any fenced block tagged ```abc renders live
  notation (abcjs `renderAbc`) using `mode: "inline"` — the score replaces the
  source unless the caret is inside the block. Implemented as a TipTap NodeView
  over `codeBlock` keyed by `attrs.language`, driven by the renderer registry.
  The corner chip mirrors the spec and opens the fence editor.
- **Reference plugin — Mermaid diagrams:** ```mermaid blocks render as charts
  (lazy-loaded `mermaid`, `securityLevel: "strict"`) using `mode: "inline"` —
  the diagram replaces the source unless the caret is inside the block; parse
  errors show inline instead of a chart.
- **Syntax highlighting:** fenced blocks are tokenised with highlight.js
  (lowlight `common` bundle) and coloured via ProseMirror inline decorations
  computed per transaction in a `codeBlockHighlight` plugin; unknown languages
  stay plain. Theme-aware palettes live in styles.css.
- **Language specs:** the fence info string is kept verbatim in `attrs.language`
  and round-trips through markdown. Format: `lang` or `lang{opts}` — currently
  `{1,3-5}` line lists/ranges, rendered as `hl-line` decorations.
  Renderers/highlighting resolve the base language only.
- **Fence reveal:** while a block is being edited (caret inside), its
  opening/closing `` ``` `` lines are shown around the source and hidden on
  leave. The spec on the opening line is click- or keyboard-editable: entering
  any code block from above/right stops on its opening fence (`cbFenceFocus`
  transaction meta + caret move), ↑/← from the code's first line/edge hands
  control to it, Enter/Tab/↓/→ commit back into the code, ↑/← at the input's
  edges leave the block, Esc cancels. The corner chip mirrors the spec and opens
  the same editor.

### 6.11 Settings & secrets

- `settings.json` under the OS config dir (`$HOME/.config/cambium` on Linux,
  `%APPDATA%/cambium` on Windows, `~/Library/Application Support/cambium` on
  macOS). Atomic writes (tmp + rename). Window geometry persisted separately and
  restored on launch (deno desktop does not remember it).

### 6.12 Native shell

- Startup window adopted via first `BrowserWindow` construction (1400×900
  default).
- Native application menu (File/Edit/View/AI/Publish) with accelerators;
  `menuclick` events forwarded into the webview as DOM CustomEvents so all menu
  items share one code path with in-page buttons.
- Compiled binaries run with `-A` baked in (local app: fs/env/spawn for git &
  netlify CLIs). The HTTP listener is localhost-only regardless.

---

## 7. RPC surface (v1)

| Method                                                    | Args                 | Returns                           |
| --------------------------------------------------------- | -------------------- | --------------------------------- |
| `app.ping/version`                                        | –                    | status info                       |
| `settings.get/updateAuthor/upsertProvider/removeProvider` | – / partial          | AppSettings                       |
| `collections.list/add/remove`                             | path?                | configs / validation result       |
| `fs.tree`                                                 | `{collectionId}`     | nested entries (.md files + dirs) |
| `note.read/write/create/delete/rename`                    | paths + payload      | note / ok                         |
| `templates.list`                                          | `{collectionId?}`    | builtin + user templates          |
| `graph.get`                                               | `{collectionId?}`    | GraphData                         |
| `search.query`                                            | `{q, collectionId?}` | ranked hits                       |
| `git.status/log/commit/push/pull/init/connectRemote`      | `{collectionId,…}`   | structured results                |
| `publish.status/saveProfile/createSite/sync/build/deploy` | `{collectionId,…}`   | logs/results                      |
| `ai.providers/backlinks/commands`                         | –                    | sanitised provider list etc.      |

Streaming endpoint: `POST /api/ai/stream` → SSE deltas. Errors cross the
boundary as `{name,message}` objects (bindings semantics).

---

## 8. Key data flows

**Open → edit → autosave → reindex**

1. Explorer click → `note.read` → parse fm/body → TipTap `setContent`.
2. Keystrokes mark dirty; 600 ms after last keystroke → serialize markdown →
   recompose with frontmatter → `note.write`.
3. Backend write bumps watcher → debounced reindex → `cambium:index-changed`
   event → frontend refreshes tree lazily.

**Publish** `sync → build → deploy` are separate buttons (log visible between
steps); `deploy.github-pages` refuses to run when `repoUrl` is unset or dist
missing.

**AI stream** Panel builds context bundle → POST SSE → deltas appended → user
inserts result via editor commands (never auto-written to disk).

---

## 9. Security & privacy

- Local-only HTTP listener (127.0.0.1, enforced by deno desktop).
- Path guard on every fs route; spawn args allow-listed per adapter.
- AI requests go directly from the local process to the configured endpoint; no
  telemetry. API keys never leave the machine except to the provider.
- CSP hardening + user-plugin sandbox review tracked in §13/§14.

## 10. Testing & quality gates

- `deno task test` — unit tests for core (frontmatter round-trip, wikilink/tag
  extraction, link resolution precedence, graph build/scoping, template
  interpolation, ids/filenames, search ranking).
- `deno task check` — `deno check` across backend/core/adapters/web.
- `deno task build` — vite production build (catches frontend breakage).
- Smoke: boot server headless, RPC calls, static asset serving; compiled binary
  boots and serves on its auto-assigned port.
- `deno lint` + `deno fmt` clean.

## 11. Getting started

```sh
deno install                     # cache deps, create node_modules
deno task dev                    # backend :8787 + vite :5173 (browser dev)
open http://localhost:5173       # full app, transport falls back to HTTP

deno task build && deno task desktop   # real desktop window w/ bindings
                                       # (-A bakes fs/env/spawn perms into the binary)
deno task package                # redistributable binary (per-platform)
deno task check | test | lint | fmt
```

First run: add a collection via ⌂ or Settings → paste an absolute folder path
(native pickers pending upstream). Create notes from templates with `+`, link
them with `[[...]]`, open the Graph from the toolbar.

## 12. Milestones

- **M0 (this repo)** — everything in §6 vertical-slice functional; desktop
  window, menus, watcher; tests green; packaging script verified.
- **M1** — editor polish: CodeMirror source mode, paste-image handling, slash
  menu, table editor; link autocomplete `[[`.
- **M2** — graph upgrades: tag edges, filters/orphans, local graph sidebar.
- **M3** — publishing: GH Actions workflow generation, draft preview server
  button, per-collection site config UI.
- **M4** — secrets in OS keychain; plugin loading from `.cambium/plugins/` with
  manifest consent screen; AI: embeddings-backed “research” over the corpus
  (local index).
- **M5** — Tauri adapter + browser-only target (OPFS/isomorphic-git),
  collaboration spike.

## 13. Risks & mitigations

| Risk                                                                                         | Mitigation                                                                                                     |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Markdown round-trip fidelity (WYSIWYG)                                                       | Canonical serializer config, source-mode escape hatch (M1), snapshot fixtures in tests                         |
| `deno desktop` young API surface (no native file pickers; no stable BrowserWindow types yet) | Path-input UX now; narrow local shim (`backend/desktop-shim.ts`) to delete when types land                     |
| External CLIs (git/netlify/pm) missing on user machines                                      | Pre-flight checks with actionable error messages in panels                                                     |
| User plugins execute in webview realm                                                        | Manifest shown before enabling (M4); sandbox review before any marketplace                                     |
| AI keys at rest plaintext                                                                    | Flagged in UI; keychain adapter scheduled M4                                                                   |
| Large collections                                                                            | Debounced indexing, index stores refs (not bodies) except search corpus; FA2 barnesHutOptimize above 500 nodes |

## 14. Explicit version pins (v0 baseline)

react/react-dom 18.x · @tiptap/* 2.x · tiptap-markdown 0.8.x · zustand 4.x ·
sigma 3.x · graphology 0.25.x · graphology-layout-forceatlas2 0.10.x · abcjs 6.x
· yaml 2.x · vite 5.x — pinned in `deno.json` imports so the toolchain is
reproducible regardless of upstream majors.
