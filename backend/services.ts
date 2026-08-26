import * as path from "@std/path";
import { splitFrontMatter, titleFromNote } from "../src-core/frontmatter.ts";
import { buildGraph } from "../src-core/graph.ts";
import { resolveLink } from "../src-core/links.ts";
import { rewriteLinksForRename } from "../src-core/rename.ts";
import { applyTemplate } from "../src-core/templates.ts";
import { generateId, safeFileName } from "../src-core/ids.ts";
import { query } from "../src-core/search.ts";
import type {
  AppSettings,
  CollectionConfig,
  GitStatus,
  GraphData,
  NoteRef,
  ThemePreference,
} from "../src-core/types.ts";
import * as git from "../adapters/git.ts";
import {
  buildSite,
  deployGhPages,
  deployNetlify,
  ensureSite,
  siteDirFor,
  syncNotes,
} from "../adapters/astro.ts";
import {
  deleteEntry,
  guard,
  indexCollection,
  readNote as fsReadNote,
  readTree,
  renameEntry,
  validateCollectionDir,
  writeNote as fsWriteNote,
} from "../adapters/workspace.ts";
import { loadSettings, saveSettings } from "../adapters/settings.ts";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".avif": "image/avif",
};

const BUILTIN_TEMPLATES = [
  {
    id: "builtin:blank",
    label: "Blank note",
    content: "",
  },
  {
    id: "builtin:zettel",
    label: "Zettel (permanent note)",
    content: `---
title: "{{title}}"
tags: []
---

# {{title}}

Source:

In my own words:

Related: [[ ]]
`,
  },
  {
    id: "builtin:blog-post",
    label: "Blog post",
    content: `---
title: "{{title}}"
description: ""
tags: []
draft: true
---

# {{title}}

## The problem

## What I did

## What I learned
`,
  },
  {
    id: "builtin:daily",
    label: "Daily note",
    content: `---
title: "{{title}}"
date: "{{date}}"
type: daily
---

# {{date}}

## Focus

## Log

-
`,
  },
];

export interface TemplateInfo {
  id: string;
  label: string;
  content: string;
}

interface CollectionIndex {
  refs: NoteRef[];
  bodies: Map<string, string>;
}

/** Handle for a running fs watcher so it can be stopped on unload/remove. */
interface WatcherHandle {
  promise: Promise<void>;
  close(): void;
}

export class CambiumService {
  settings: AppSettings;
  private indexes = new Map<string, CollectionIndex>();
  private watchers = new Map<string, WatcherHandle>();
  private reindexQueued = new Set<string>();
  /** Set by the desktop shell to push events into every open webview. */
  notify: ((event: string, detail?: unknown) => void) | null = null;

  private constructor(settings: AppSettings) {
    this.settings = settings;
  }

  static async create(): Promise<CambiumService> {
    const svc = new CambiumService(await loadSettings());
    for (const c of svc.settings.collections) {
      if (c.unloaded) continue;
      await svc.reindex(c.id);
      svc.startWatcher(c);
    }
    return svc;
  }

  version(): string {
    return "0.1.0";
  }

  // ------------------------------------------------------------ collections

  listCollections(): Array<
    CollectionConfig & { noteCount: number; loaded: boolean }
  > {
    return this.settings.collections.map((c) => ({
      ...c,
      noteCount: this.indexes.get(c.id)?.refs.length ?? 0,
      loaded: this.isLoaded(c.id),
    }));
  }

  async addCollection(
    dirPath: string,
    name?: string,
  ): Promise<CollectionConfig> {
    const abs = await validateCollectionDir(dirPath);
    const existing = this.settings.collections.find((c) => c.path === abs);
    if (existing) {
      return this.isLoaded(existing.id)
        ? existing
        : this.loadCollection(existing.id);
    }
    const cfg: CollectionConfig = {
      id: crypto.randomUUID().slice(0, 8),
      name: name?.trim() || path.basename(abs),
      path: abs,
      createdAt: new Date().toISOString(),
      templateDir: ".cambium/templates",
      idFormat: "zettel",
    };
    this.settings.collections.push(cfg);
    await this.persist();
    await this.reindex(cfg.id);
    this.startWatcher(cfg);
    return cfg;
  }

  async removeCollection(id: string): Promise<void> {
    this.stopWatcher(id);
    this.settings.collections = this.settings.collections.filter((c) =>
      c.id !== id
    );
    this.indexes.delete(id);
    await this.persist();
  }

  /**
   * Release a registered collection's index and file watcher without
   * forgetting it. The flag persists so restarts keep it unloaded.
   */
  async unloadCollection(id: string): Promise<void> {
    const cfg = this.collection(id);
    if (!this.isLoaded(id)) return;
    cfg.unloaded = true;
    this.stopWatcher(id);
    this.indexes.delete(id);
    await this.persist();
    this.notify?.("index-changed", { collectionId: id });
  }

  /** (Re)load a previously unloaded collection: index it and start watching. */
  async loadCollection(id: string): Promise<CollectionConfig> {
    const cfg = this.collection(id);
    cfg.unloaded = false;
    await this.persist();
    await this.reindex(id);
    this.startWatcher(cfg);
    this.notify?.("index-changed", { collectionId: id });
    return cfg;
  }

  private isLoaded(id: string): boolean {
    const cfg = this.settings.collections.find((c) => c.id === id);
    return !!cfg && !cfg.unloaded;
  }

  private collection(id: string): CollectionConfig {
    const cfg = this.settings.collections.find((c) => c.id === id);
    if (!cfg) throw new Error(`Unknown collection: ${id}`);
    return cfg;
  }

  private async persist(): Promise<void> {
    await saveSettings(this.settings);
  }

  /** Public persistence hook for RPC handlers that mutate settings. */
  persistSettings(): Promise<void> {
    return this.persist();
  }

  async upsertProvider(
    provider: AppSettings["aiProviders"][number],
  ): Promise<void> {
    const list = this.settings.aiProviders;
    const i = list.findIndex((x) => x.id === provider.id);
    if (i >= 0) list[i] = provider;
    else {
      provider.id = provider.id || crypto.randomUUID().slice(0, 8);
      list.push(provider);
    }
    await this.persist();
  }

  async removeProvider(id: string): Promise<void> {
    this.settings.aiProviders = this.settings.aiProviders.filter((p) =>
      p.id !== id
    );
    if (this.settings.activeProviderId === id) {
      this.settings.activeProviderId = undefined;
    }
    await this.persist();
  }

  setTheme(theme: ThemePreference): Promise<void> {
    this.settings.theme = theme;
    return this.persist();
  }

  // ------------------------------------------------------------------- index

  private async reindex(collectionId: string): Promise<void> {
    const cfg = this.settings.collections.find((c) => c.id === collectionId);
    if (!cfg || cfg.unloaded) return;
    try {
      this.indexes.set(collectionId, await indexCollection(cfg));
    } catch (e) {
      console.error(`reindex failed for ${cfg.name}:`, e);
    }
  }

  private startWatcher(cfg: CollectionConfig): void {
    if (this.watchers.has(cfg.id) || !("watchFs" in Deno)) return;
    let closing = false;
    let resource: Deno.FsWatcher | null = null;
    const runLoop = (async () => {
      try {
        const watcher = Deno.watchFs(cfg.path, { recursive: true });
        resource = watcher;
        let timer: number | null = null;
        const schedule = () => {
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(() => {
            if (closing) return;
            void this.reindex(cfg.id).then(() =>
              this.notify?.("index-changed", { collectionId: cfg.id })
            );
          }, 500);
        };
        for await (const _event of watcher) {
          if (closing) break;
          schedule();
        }
      } catch {
        // watcher unavailable (e.g. deleted dir or closed on unload); ignore
      }
    })();
    this.watchers.set(cfg.id, {
      promise: runLoop,
      close: () => {
        closing = true;
        try {
          resource?.close();
        } catch {
          // already closed
        }
      },
    });
  }

  private stopWatcher(id: string): void {
    const handle = this.watchers.get(id);
    if (!handle) return;
    this.watchers.delete(id);
    handle.close();
  }

  private indexOf(id: string): CollectionIndex {
    return this.indexes.get(id) ?? { refs: [], bodies: new Map() };
  }

  allRefs(): NoteRef[] {
    return [...this.indexes.values()].flatMap((i) => i.refs);
  }

  // --------------------------------------------------------------------- fs

  tree(collectionId: string) {
    return readTree(this.collection(collectionId).path);
  }

  readNote(collectionId: string, rel: string) {
    return fsReadNote(this.collection(collectionId).path, rel);
  }

  async readFile(
    collectionId: string,
    rel: string,
  ): Promise<{ body: Uint8Array; contentType: string }> {
    const cfg = this.collection(collectionId);
    const abs = guard(cfg.path, rel);
    const stat = await Deno.stat(abs);
    if (!stat.isFile) throw new Error("Not a file");
    const body = await Deno.readFile(abs);
    const ext = abs.slice(abs.lastIndexOf(".")).toLowerCase();
    const contentType = IMAGE_MIME[ext] ?? "application/octet-stream";
    return { body, contentType };
  }

  async writeNote(collectionId: string, rel: string, text: string) {
    await fsWriteNote(this.collection(collectionId).path, rel, text);
  }

  async createNote(
    collectionId: string,
    folder: string,
    title: string,
    templateId?: string,
    extraVars?: Record<string, string>,
  ): Promise<{ path: string }> {
    const cfg = this.collection(collectionId);
    const tpl = (await this.listTemplates(collectionId))
      .find((t) => t.id === templateId);
    const id = generateId(cfg.idFormat ?? "zettel");
    const fileName = safeFileName(title, id);
    const rel = folder ? `${folder}/${fileName}` : fileName;
    const text = tpl && templateId !== "builtin:blank"
      ? applyTemplate(tpl.content, {
        title,
        id,
        author: this.settings.authorName || undefined,
        extraVars,
      })
      : `---\ntitle: ${JSON.stringify(title)}\ndate: ${
        new Date().toISOString().slice(0, 10)
      }\n---\n\n`;
    await fsWriteNote(cfg.path, rel, text);
    return { path: rel };
  }

  deleteEntry(collectionId: string, rel: string) {
    return deleteEntry(this.collection(collectionId).path, rel);
  }

  async renameEntry(collectionId: string, from: string, to: string) {
    const cfg = this.collection(collectionId);
    const dest = await renameEntry(cfg.path, from, to);

    // Rewire wikilinks in notes that resolved to the old location, using the
    // pre-rename path list for resolution.
    const idx = this.indexes.get(collectionId);
    if (idx) {
      const samePath = (a: string, b: string) =>
        a.replace(/\.md$/i, "") === b.replace(/\.md$/i, "");
      const canonicalFrom = idx.refs.find((r) =>
        samePath(r.path, from)
      )?.path ?? from;
      const prePaths = idx.refs.map((r) => r.path);
      for (const ref of idx.refs) {
        if (
          !ref.links.some((l) => resolveLink(l, prePaths) === canonicalFrom)
        ) {
          continue;
        }
        try {
          const abs = path.join(cfg.path, ref.path);
          const text = await Deno.readTextFile(abs);
          const { text: rewritten, count } = rewriteLinksForRename(
            text,
            canonicalFrom,
            dest,
            prePaths,
          );
          if (count > 0) await Deno.writeTextFile(abs, rewritten);
        } catch {
          // unreadable file: skip link rewriting for it
        }
      }
      // Keep search/graph consistent immediately; the watcher reindexes soon
      // anyway, but a rename should not leave stale entries behind.
      const moved = idx.refs.find((r) => r.path === canonicalFrom);
      if (moved) {
        moved.path = dest;
        moved.title = titleFromNote(dest, moved.fm);
        const body = idx.bodies.get(canonicalFrom);
        if (body !== undefined) {
          idx.bodies.delete(canonicalFrom);
          idx.bodies.set(dest, body);
        }
      }
    }
    this.notify?.("index-changed", { collectionId });
  }

  // -------------------------------------------------------------- templates

  async listTemplates(collectionId?: string): Promise<TemplateInfo[]> {
    const out = [...BUILTIN_TEMPLATES];
    if (!collectionId) return out;
    const cfg = this.settings.collections.find((c) => c.id === collectionId);
    if (!cfg) return out;
    const dir = path.join(cfg.path, cfg.templateDir ?? ".cambium/templates");
    try {
      for await (const e of Deno.readDir(dir)) {
        if (e.isFile && e.name.endsWith(".md")) {
          const content = await Deno.readTextFile(path.join(dir, e.name));
          out.push({
            id: `user:${e.name}`,
            label: titleFromNote(e.name, splitFrontMatter(content).fm),
            content,
          });
        }
      }
    } catch {
      // no user templates yet
    }
    return out;
  }

  // ---------------------------------------------------------- graph, search

  getGraph(scopeCollectionId?: string): GraphData {
    return buildGraph(this.allRefs(), { ghosts: false, scopeCollectionId });
  }

  search(q: string, collectionId?: string) {
    const refs = collectionId
      ? this.indexOf(collectionId).refs
      : this.allRefs();
    const bodies = collectionId ? this.indexOf(collectionId).bodies : new Map(
      [...this.indexes.entries()].flatMap(([, i]) => [...i.bodies]),
    );
    return query(q, refs, bodies).map((h) => ({
      path: h.note.path,
      title: h.note.title,
      collectionId: h.note.collectionId,
      score: h.score,
    }));
  }

  backlinks(collectionId: string, targetPath: string) {
    const idx = this.indexOf(collectionId);
    const out: { title: string; path: string; excerpt: string }[] = [];
    for (const ref of idx.refs) {
      if (ref.path === targetPath) continue;
      for (const link of ref.links) {
        const resolved = resolveLike(link, idx.refs.map((r) => r.path));
        if (resolved === targetPath) {
          const rawBody = idx.bodies.get(ref.path) ?? "";
          out.push({
            title: ref.title,
            path: ref.path,
            excerpt: rawBody.replace(/[#>*`\-\[\]]/g, "").slice(0, 180),
          });
          break;
        }
      }
    }
    return out;
  }

  // -------------------------------------------------------------------- git

  private async gitReady(collectionId: string): Promise<string> {
    const cfg = this.collection(collectionId);
    if (!(await git.requireGit(cfg.path))) {
      throw new git.GitError("This folder is not a git repository yet.");
    }
    return cfg.path;
  }

  async gitStatus(collectionId: string): Promise<GitStatus> {
    const cfg = this.collection(collectionId);
    return await git.status(cfg.path);
  }

  async gitInit(collectionId: string): Promise<GitStatus> {
    const cfg = this.collection(collectionId);
    await git.init(cfg.path);
    return await git.status(cfg.path);
  }

  async gitConnectRemote(
    collectionId: string,
    url: string,
  ): Promise<GitStatus> {
    const p = await this.gitReady(collectionId);
    await git.setRemote(p, url.trim());
    return await git.status(p);
  }

  async gitCommit(collectionId: string, message: string): Promise<string> {
    const p = await this.gitReady(collectionId);
    if (!message.trim()) throw new git.GitError("Commit message is empty.");
    return await git.commit(p, message.trim());
  }

  gitLog(collectionId: string, n?: number) {
    return git.log(this.collection(collectionId).path, n ?? 20);
  }

  gitPush(collectionId: string) {
    return git.push(this.collection(collectionId).path);
  }

  gitPull(collectionId: string) {
    return git.pull(this.collection(collectionId).path);
  }

  // ---------------------------------------------------------------- publish

  async publishStatus(collectionId: string) {
    const cfg = this.collection(collectionId);
    const site = siteDirFor(cfg.path);
    let siteExists = false;
    try {
      siteExists = (await Deno.stat(path.join(site, "package.json"))).isFile;
    } catch {
      siteExists = false;
    }
    return {
      profile: cfg.publish ?? null,
      siteDir: site,
      siteExists,
    };
  }

  async publishCreateSite(collectionId: string) {
    const cfg = this.collection(collectionId);
    return { siteDir: await ensureSite(cfg.path) };
  }

  publishSync(collectionId: string) {
    const cfg = this.requirePublishProfile(collectionId);
    return syncNotes(this.collection(collectionId).path, cfg);
  }

  async publishBuild(collectionId: string) {
    const cfg = this.collection(collectionId);
    return { distDir: await buildSite(cfg.path) };
  }

  publishDeploy(collectionId: string): Promise<string> {
    const cfg = this.requirePublishProfile(collectionId);
    switch (cfg.target) {
      case "github-pages":
        return deployGhPages(
          this.collection(collectionId).path,
          cfg.repoUrl ?? "",
        );
      case "netlify":
        return deployNetlify(
          this.collection(collectionId).path,
          cfg.netlifySite,
        );
    }
  }

  async publishSaveProfile(
    collectionId: string,
    profile: Partial<NonNullable<CollectionConfig["publish"]>>,
  ) {
    const cfg = this.collection(collectionId);
    cfg.publish = {
      enabled: profile.enabled ?? true,
      mode: "adjacent-site",
      target: profile.target ?? "github-pages",
      repoUrl: profile.repoUrl,
      netlifySite: profile.netlifySite,
      includeDrafts: profile.includeDrafts ?? false,
    };
    await this.persist();
    return cfg.publish;
  }

  private requirePublishProfile(collectionId: string) {
    const cfg = this.collection(collectionId);
    if (!cfg.publish?.enabled) {
      throw new Error("Publishing is not configured for this collection.");
    }
    return cfg.publish;
  }
}

function resolveLike(target: string, paths: string[]): string | null {
  const norm = (p: string) => p.replace(/\.md$/, "").replace(/^\.\//, "");
  const t = norm(target);
  const exact = paths.find((p) => norm(p) === t);
  if (exact) return exact;
  const base = t.split("/").pop()!;
  return paths.find((p) => norm(p).split("/").pop() === base) ?? null;
}
