import { resolveLink } from "./links.ts";

/**
 * Clean a collection-relative path: posix separators, no leading "./" or "/",
 * no empty segments. Rejects traversal ("..") outright.
 */
export function cleanRelPath(p: string): string {
  const parts = p.trim().replace(/\\/g, "/").split("/");
  if (parts.some((seg) => seg === "..")) {
    throw new Error(`Path escapes collection: ${p}`);
  }
  return parts.filter((seg) => seg !== "" && seg !== ".").join("/");
}

/**
 * Validate and normalise a rename/move request. Both paths must stay inside
 * the collection; source and destination must differ (case-only renames are
 * allowed).
 */
export function normalizeRename(
  from: string,
  to: string,
): { from: string; to: string } {
  const f = cleanRelPath(from);
  const t = cleanRelPath(to);
  if (!f || !t) throw new Error("Rename paths must not be empty.");
  if (f === t) throw new Error("Source and destination are identical.");
  return { from: f, to: t };
}

const WIKILINK_RE = /\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
const FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

function stripExt(p: string): string {
  return p.replace(/\.md$/i, "");
}

function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * Rewrite wikilinks in `text` that currently resolve to note `from` so they
 * point at the renamed location `to`. Targets keep their shape: bare basenames
 * stay bare, path-like targets become the full new relpath, an explicit .md
 * suffix is preserved. Links inside code fences and links that do not resolve
 * to `from` are left untouched. Returns the new text and how many links were
 * rewritten.
 */
export function rewriteLinksForRename(
  text: string,
  from: string,
  to: string,
  /** All known note paths *before* the rename, used for link resolution. */
  allPaths: string[],
): { text: string; count: number } {
  const fences: Array<[number, number]> = [];
  for (const m of text.matchAll(FENCE_RE)) {
    fences.push([m.index, m.index + m[0].length]);
  }
  const inFence = (i: number) => fences.some(([s, e]) => i >= s && i < e);

  let count = 0;
  let result = "";
  let last = 0;
  for (const m of text.matchAll(WIKILINK_RE)) {
    const idx = m.index ?? 0;
    if (inFence(idx)) continue;
    const target = m[1].trim();
    if (resolveLink(target, allPaths) !== from) continue;
    const hadExt = /\.md$/i.test(target);
    const newPath = hadExt ? `${stripExt(to)}.md` : stripExt(to);
    // Bare-basename links keep referring by basename; explicit relative
    // paths are rewritten to the new full path so they stay unambiguous.
    const newTarget = target.includes("/") ? newPath : baseName(newPath);
    result += text.slice(last, idx) +
      `[[${newTarget}${m[2] ?? ""}${m[3] !== undefined ? `|${m[3]}` : ""}]]`;
    last = idx + m[0].length;
    count++;
  }
  if (count === 0) return { text, count };
  return { text: result + text.slice(last), count };
}
