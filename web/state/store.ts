import { create } from "zustand";
import { joinFrontMatter } from "../../src-core/frontmatter.ts";
import type {
  CollectionConfig,
  FileEntry,
  GraphData,
  NoteContent,
  ThemePreference,
} from "../../src-core/types.ts";
import { rpc } from "../transport.ts";
import { applyTheme } from "./theme.ts";

export type PanelKind = "outline" | "ai" | "git" | "publish" | null;
export type DialogKind =
  | "templates"
  | "templates-manager"
  | "settings"
  | "add-collection"
  | null;

export interface Tab {
  path: string;
  title: string;
}

interface StoreState {
  collections: Array<
    CollectionConfig & { noteCount: number; loaded: boolean }
  >;
  activeCollectionId: string | null;
  tree: FileEntry[];
  tabs: Tab[];
  activePath: string | null;
  notes: Record<string, NoteContent>;
  dirty: Set<string>;
  graph: GraphData | null;
  panel: PanelKind;
  dialog: DialogKind;
  status: string;
  version: string;
  graphOpen: boolean;
  themePref: ThemePreference;

  bootstrap(): Promise<void>;
  refreshCollections(): Promise<void>;
  setActiveCollection(id: string): Promise<void>;
  unloadCollection(): Promise<void>;
  loadCollection(id: string): Promise<void>;
  loadTree(): Promise<void>;
  openNote(path: string, title?: string): Promise<void>;
  closeTab(path: string): void;
  setActive(path: string): void;
  updateBody(path: string, markdown: string): void;
  updateFrontMatter(path: string, fm: Record<string, unknown>): void;
  save(path?: string): Promise<void>;
  createNote(opts: {
    folder: string;
    title: string;
    templateId?: string;
    extraVars?: Record<string, string>;
  }): Promise<void>;
  deleteEntry(path: string): Promise<void>;
  renameEntry(from: string, to: string): Promise<void>;
  loadGraph(collectionId?: string): Promise<void>;
  setPanel(p: PanelKind): void;
  setDialog(d: DialogKind): void;
  setStatus(s: string): void;
  setTheme(p: ThemePreference): Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  collections: [],
  activeCollectionId: null,
  tree: [],
  tabs: [],
  activePath: null,
  notes: {},
  dirty: new Set<string>(),
  graph: null,
  panel: "outline",
  dialog: null,
  status: "",
  version: "",
  graphOpen: false,
  themePref: "auto",

  async bootstrap() {
    try {
      await get().refreshCollections();
      const v = await rpc<{ version: string }>("app.version");
      set({ version: v.version });
      // Reconcile with persisted settings in case the cached preference is
      // missing (first run) or stale (changed by another window).
      const s = await rpc<{ theme?: ThemePreference }>("settings.get");
      const pref = s.theme ?? "auto";
      if (pref !== get().themePref) {
        applyTheme(pref);
        set({ themePref: pref });
      }
      const first = get().collections.find((c) => c.loaded);
      if (first) {
        await get().setActiveCollection(first.id);
        // Auto-open the first note so the editor is immediately visible.
        const firstFile = get().tree.find((e) => e.kind === "file");
        if (firstFile) await get().openNote(firstFile.path);
      }
    } catch (e) {
      set({ status: `Startup failed: ${msg(e)}` });
    }
  },

  async refreshCollections() {
    const collections = await rpc<
      Array<CollectionConfig & { noteCount: number; loaded: boolean }>
    >(
      "collections.list",
    );
    set({ collections });
  },

  async setActiveCollection(id) {
    // Selecting an unloaded collection loads it on demand.
    const target = get().collections.find((c) => c.id === id);
    if (target && !target.loaded) {
      await get().loadCollection(id);
      return;
    }
    set({ activeCollectionId: id, tree: [], activePath: null });
    await get().loadTree();
  },

  /** Unload the active collection: flush edits, release index + watcher. */
  async unloadCollection() {
    const id = get().activeCollectionId;
    if (!id) {
      set({ status: "No collection to unload." });
      return;
    }
    const prefix = `${id}:`;
    for (const key of [...get().dirty]) {
      if (!key.startsWith(prefix)) continue;
      const path = key.slice(prefix.length);
      const timer = saveTimers.get(path);
      if (timer !== undefined) {
        clearTimeout(timer);
        saveTimers.delete(path);
      }
      await get().save(path);
    }
    try {
      await rpc("collections.unload", { id });
    } catch (e) {
      set({ status: `Unload failed: ${msg(e)}` });
      return;
    }
    await get().refreshCollections();
    set((s) => {
      const notes: typeof s.notes = {};
      for (const [k, v] of Object.entries(s.notes)) {
        if (!k.startsWith(prefix)) notes[k] = v;
      }
      return {
        notes,
        dirty: new Set([...s.dirty].filter((k) => !k.startsWith(prefix))),
        tabs: [],
        tree: [],
        activePath: null,
      };
    });
    const next = get().collections.find((c) => c.loaded && c.id !== id);
    if (next) await get().setActiveCollection(next.id);
    else set({ activeCollectionId: null, status: "Collection unloaded." });
  },

  async loadCollection(id) {
    try {
      await rpc("collections.load", { id });
    } catch (e) {
      set({ status: `Load failed: ${msg(e)}` });
      return;
    }
    await get().refreshCollections();
    await get().setActiveCollection(id);
    set({ status: "Collection loaded." });
  },

  async loadTree() {
    const id = get().activeCollectionId;
    if (!id) return;
    try {
      const tree = await rpc<FileEntry[]>("fs.tree", { collectionId: id });
      set({ tree });
    } catch (e) {
      set({ status: msg(e) });
    }
  },

  async openNote(path, title) {
    const id = get().activeCollectionId;
    if (!id) return;
    if (!path.endsWith(".md")) return;
    const key = `${id}:${path}`;
    if (!get().notes[key]) {
      try {
        const note = await rpc<NoteContent>("note.read", {
          collectionId: id,
          path,
        });
        set((s) => ({ notes: { ...s.notes, [key]: note } }));
      } catch (e) {
        set({ status: `Could not open ${path}: ${msg(e)}` });
        return;
      }
    }
    const t = title ?? path.split("/").pop()?.replace(/\.md$/, "") ?? path;
    set((s) => ({
      tabs: s.tabs.some((x) => x.path === path)
        ? s.tabs
        : [...s.tabs, { path, title: t }],
      activePath: path,
    }));
  },

  closeTab(path) {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      return {
        tabs,
        activePath: s.activePath === path
          ? tabs[tabs.length - 1]?.path ?? null
          : s.activePath,
      };
    });
  },

  setActive(path) {
    set({ activePath: path });
  },

  updateBody(path, markdown) {
    const id = get().activeCollectionId!;
    const key = `${id}:${path}`;
    const note = get().notes[key];
    if (!note || note.body === markdown) return;
    set((s) => ({
      notes: { ...s.notes, [key]: { ...note, body: markdown } },
      dirty: new Set(s.dirty).add(key),
    }));
    scheduleSave(path);
  },

  updateFrontMatter(path, fm) {
    const id = get().activeCollectionId!;
    const key = `${id}:${path}`;
    const note = get().notes[key];
    if (!note) return;
    set((s) => ({
      notes: { ...s.notes, [key]: { ...note, fm } },
      dirty: new Set(s.dirty).add(key),
    }));
    scheduleSave(path);
  },

  async save(targetPath) {
    const id = get().activeCollectionId;
    const path = targetPath ?? get().activePath;
    if (!id || !path) return;
    const key = `${id}:${path}`;
    const note = get().notes[key];
    if (!note) return;
    const text = joinFrontMatter(note.fm, note.body);
    try {
      await rpc("note.write", { collectionId: id, path, text });
      set((s) => {
        const dirty = new Set(s.dirty);
        dirty.delete(key);
        return { dirty, status: `Saved ${path}` };
      });
    } catch (e) {
      set({ status: `Save failed: ${msg(e)}` });
    }
  },

  async createNote({ folder, title, templateId, extraVars }) {
    const id = get().activeCollectionId;
    if (!id) {
      throw new Error("No collection selected. Add one first (⌂ button).");
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("Title is empty.");
    const res = await rpc<{ path: string }>("note.create", {
      collectionId: id,
      folder,
      title: trimmedTitle,
      templateId,
      extraVars,
    });
    await get().loadTree();
    await get().openNote(res.path, trimmedTitle);
    set({ dialog: null, status: `Created ${res.path}` });
  },

  async deleteEntry(path) {
    const id = get().activeCollectionId;
    if (!id) {
      set({ status: "Cannot delete: no collection selected." });
      return;
    }
    await rpc("note.delete", { collectionId: id, path });
    get().closeTab(path);
    await get().loadTree();
    set({ status: `Deleted ${path}` });
  },

  async renameEntry(from, to) {
    const id = get().activeCollectionId;
    if (!id) {
      set({ status: "Cannot rename: no collection selected." });
      return;
    }
    // Cancel any pending autosave and flush unsaved edits first: a timer
    // firing after the rename would recreate the file at its old location.
    const timer = saveTimers.get(from);
    if (timer !== undefined) {
      clearTimeout(timer);
      saveTimers.delete(from);
    }
    const oldKey = `${id}:${from}`;
    if (get().dirty.has(oldKey)) await get().save(from);
    // The backend resolves the destination (may append a missing .md); fall
    // back to the requested path if the transport yields nothing usable.
    let dest = to;
    try {
      const res = await rpc<unknown>("note.rename", {
        collectionId: id,
        from,
        to,
      });
      if (typeof res === "string" && res) dest = res;
    } catch (e) {
      set({ status: `Rename failed: ${msg(e)}` });
      throw e;
    }
    const newKey = `${id}:${dest}`;
    set((s) => {
      const notes = { ...s.notes };
      if (notes[oldKey]) {
        notes[newKey] = { ...notes[oldKey], path: dest };
        delete notes[oldKey];
      }
      const dirty = new Set(s.dirty);
      if (dirty.delete(oldKey)) dirty.add(newKey);
      return {
        notes,
        dirty,
        tabs: s.tabs.map((t) =>
          t.path === from
            ? {
              ...t,
              path: dest,
              title: dest.split("/").pop()?.replace(/\.md$/, "") ?? dest,
            }
            : t
        ),
        activePath: s.activePath === from ? dest : s.activePath,
        status: `Renamed ${from} → ${dest}`,
      };
    });
    await get().loadTree();
  },

  async loadGraph(scopeId) {
    const graph = await rpc<GraphData>("graph.get", {
      collectionId: scopeId ?? undefined,
    });
    set({ graph });
  },

  setPanel(panel) {
    set({ panel });
  },
  setDialog(dialog) {
    set({ dialog });
  },
  setStatus(status) {
    set({ status });
  },

  async setTheme(pref) {
    const prev = get().themePref;
    if (pref === prev) return;
    applyTheme(pref);
    set({ themePref: pref });
    try {
      await rpc("settings.setTheme", { theme: pref });
    } catch (e) {
      applyTheme(prev);
      set({ themePref: prev, status: `Theme not saved: ${msg(e)}` });
    }
  },
}));

const saveTimers = new Map<string, number>();
function scheduleSave(path: string) {
  const prev = saveTimers.get(path);
  if (prev !== undefined) clearTimeout(prev);
  saveTimers.set(
    path,
    setTimeout(
      () => void useStore.getState().save(path),
      600,
    ) as unknown as number,
  );
}

export function msg(e: unknown): string {
  // Binding errors cross the realm as plain {name, message} objects.
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

/** Live editor handle for cross-component actions (AI insert etc.). */
export const editorRef: { current: import("@tiptap/core").Editor | null } = {
  current: null,
};
