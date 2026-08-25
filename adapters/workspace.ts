import * as path from "@std/path";
import {
  joinFrontMatter,
  splitFrontMatter,
  tagsFromFrontMatter,
  titleFromNote,
} from "../src-core/frontmatter.ts";
import { scanNote } from "../src-core/links.ts";
import type {
  CollectionConfig,
  FileEntry,
  NoteContent,
  NoteRef,
} from "../src-core/types.ts";

const SKIP_DIRS = new Set([
  ".git",
  ".cambium",
  ".obsidian",
  ".trash",
  "node_modules",
  "dist",
  ".publish",
]);

/** Resolve `rel` under `root`, rejecting traversal outside the root. */
export function guard(root: string, rel: string): string {
  const abs = path.resolve(root, rel);
  const normRoot = path.resolve(root);
  if (abs !== normRoot && !abs.startsWith(normRoot)) {
    throw new Error(`Path escapes collection: ${rel}`);
  }
  return abs;
}

export async function validateCollectionDir(dir: string): Promise<string> {
  const abs = path.resolve(dir);
  const stat = await Deno.stat(abs).catch(() => null);
  if (!stat?.isDirectory) throw new Error(`Not a directory: ${dir}`);
  return abs;
}

export async function ensureCambiumDir(
  root: string,
): Promise<string> {
  const dir = path.join(root, ".cambium", "templates");
  await Deno.mkdir(dir, { recursive: true });
  const cfgFile = path.join(root, ".cambium", "collection.json");
  try {
    await Deno.stat(cfgFile);
  } catch {
    await Deno.writeTextFile(cfgFile, JSON.stringify({}, null, 2));
  }
  return dir;
}

export async function readTree(
  root: string,
  rel = "",
  depth = 6,
): Promise<FileEntry[]> {
  if (depth < 0) return [];
  const out: FileEntry[] = [];
  let entries;
  try {
    entries = await Deno.readDir(guard(root, rel || "."));
  } catch {
    return [];
  }
  for await (const e of entries) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory) {
      out.push({ name: e.name, path: childRel, kind: "dir", mtime: 0 });
      out.push(...await readTree(root, childRel, depth - 1));
    } else if (e.isFile && /\.md$/i.test(e.name)) {
      const st = await Deno.stat(guard(root, childRel));
      out.push({
        name: e.name,
        path: childRel,
        kind: "file",
        mtime: st.mtime?.getTime() ?? 0,
      });
    }
  }
  out.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1
  );
  return out;
}

export async function readNote(
  root: string,
  rel: string,
): Promise<NoteContent> {
  const text = await Deno.readTextFile(guard(root, rel));
  const { fmRaw, fm, body } = splitFrontMatter(text);
  return { path: rel.replace(/\\/g, "/"), text, fmRaw, fm, body };
}

export async function writeNote(
  root: string,
  rel: string,
  text: string,
): Promise<void> {
  const abs = guard(root, rel);
  await Deno.mkdir(path.dirname(abs), { recursive: true });
  await Deno.writeTextFile(abs, text);
}

export async function deleteEntry(root: string, rel: string): Promise<void> {
  await Deno.remove(guard(root, rel), { recursive: true });
}

export async function renameEntry(
  root: string,
  from: string,
  to: string,
): Promise<void> {
  const src = guard(root, from);
  const dst = guard(root, to);
  await Deno.mkdir(path.dirname(dst), { recursive: true });
  await Deno.rename(src, dst);
}

export interface NoteBodyStore {
  get(path: string): string | undefined;
}

/**
 * Full index of one collection: parses every markdown file into a NoteRef.
 * Returns refs plus a path→body map used by search scoring.
 */
export async function indexCollection(
  cfg: CollectionConfig,
): Promise<{ refs: NoteRef[]; bodies: Map<string, string> }> {
  const refs: NoteRef[] = [];
  const bodies = new Map<string, string>();
  await walk(cfg.path, "", async (rel, mtime) => {
    try {
      const text = await Deno.readTextFile(path.resolve(cfg.path, rel));
      const { fm, body } = splitFrontMatter(text);
      const scan = scanNote(text);
      bodies.set(rel, body);
      refs.push({
        path: rel,
        title: titleFromNote(rel, fm),
        fm,
        tags: [...new Set([...scan.tags, ...tagsFromFrontMatter(fm)])],
        links: scan.links,
        mtime,
        collectionId: cfg.id,
      });
    } catch {
      // unreadable file: skip silently
    }
  });
  return { refs, bodies };
}

async function walk(
  root: string,
  rel: string,
  fn: (rel: string, mtime: number) => Promise<void>,
): Promise<void> {
  let entries;
  try {
    entries = Deno.readDir(guard(root, rel || "."));
  } catch {
    return;
  }
  for await (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory) {
      await walk(root, childRel, fn);
    } else if (e.isFile && /\.md$/i.test(e.name)) {
      const st = await Deno.stat(path.resolve(root, childRel)).catch(() =>
        null
      );
      await fn(childRel, st?.mtime?.getTime() ?? 0);
    }
  }
}

export function composeNote(
  fmRaw: string | null,
  bodyMarkdown: string,
): string {
  if (!fmRaw) return bodyMarkdown;
  // Keep the original frontmatter bytes untouched between edits.
  return `${fmRaw}\n\n${bodyMarkdown}`;
}

export function recomposeWithFm(
  note: NoteContent,
  editedFm: Record<string, unknown>,
  bodyMarkdown: string,
): string {
  if (!note.fmRaw) return joinFrontMatter(editedFm, bodyMarkdown);
  return composeNote(note.fmRaw, bodyMarkdown);
}
