/**
 * Markdown links to other notes: `[see](../guides/setup.md#install)` and
 * reference definitions `[ref]: chapter-02.md`. libromorph books link
 * chapters this way, and Pandoc and Astro sites resolve them relative to the
 * linking file. Targets are collection-relative POSIX paths; links that
 * leave the collection, use a URL scheme, start at "/" or point at anything
 * but a .md file are ignored. Links inside code fences are skipped.
 */

export interface MdLink {
  /** Offset and length of the link destination (the URL text only). */
  start: number;
  end: number;
  /** The destination as written, e.g. `<my note.md>` or `a%20b.md#x`. */
  raw: string;
  /** Collection-relative path of the target note. */
  path: string;
  /** `#anchor` and/or `?query` suffix as written, or "". */
  suffix: string;
}

const FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
// [text](dest "title") — text may hold one level of nested brackets.
const INLINE_RE =
  /(!?)\[(?:[^[\]\n]|\[[^\]\n]*\])*\]\(\s*(<[^>\n]*>|[^\s()<>]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;
// [label]: dest "title"
const DEFINITION_RE = /^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)/gm;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const MD_TARGET_RE = /^([^?#]+\.md)((?:[?#].*)?)$/i;

/** POSIX dirname of a collection-relative path ("" at the root). */
export function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : "";
}

/**
 * Resolve `target` against the folder `dir` (both collection-relative).
 * Returns null when the result would leave the collection.
 */
export function joinRelative(dir: string, target: string): string | null {
  const out = dir ? dir.split("/") : [];
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join("/");
}

/** Relative path from folder `fromDir` to file `to` (both collection-relative). */
export function relativePath(fromDir: string, to: string): string {
  const a = fromDir ? fromDir.split("/") : [];
  const b = to.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

function decode(p: string): string {
  try {
    return decodeURI(p);
  } catch {
    return p;
  }
}

function fenceRanges(text: string): Array<[number, number]> {
  return [...text.matchAll(FENCE_RE)].map((m) => [
    m.index!,
    m.index! + m[0].length,
  ]);
}

/** Every link from the note at `notePath` to another .md note, in order. */
export function findMdLinks(text: string, notePath: string): MdLink[] {
  const fences = fenceRanges(text);
  const inFence = (i: number) => fences.some(([s, e]) => i >= s && i < e);
  const dir = dirOf(notePath);
  const links: MdLink[] = [];
  const consider = (raw: string, start: number) => {
    if (inFence(start)) return;
    const dest = raw.startsWith("<") ? raw.slice(1, -1) : raw;
    if (SCHEME_RE.test(dest) || dest.startsWith("/") || dest.startsWith("#")) {
      return;
    }
    const m = MD_TARGET_RE.exec(dest);
    if (!m) return;
    const path = joinRelative(dir, decode(m[1]));
    if (!path) return;
    links.push({ start, end: start + raw.length, raw, path, suffix: m[2] });
  };
  for (const m of text.matchAll(INLINE_RE)) {
    if (m[1]) continue; // images
    // The destination follows the last "](" before it (the link text may
    // itself contain brackets).
    const open = m[0].lastIndexOf("](", m[0].length - m[2].length);
    consider(m[2], m.index! + m[0].indexOf(m[2], open + 2));
  }
  for (const m of text.matchAll(DEFINITION_RE)) {
    consider(m[1], m.index! + m[0].length - m[1].length);
  }
  return links.sort((a, b) => a.start - b.start);
}

/** Collection-relative paths of the notes a note links to with .md links. */
export function extractMdLinks(text: string, notePath: string): string[] {
  return [...new Set(findMdLinks(text, notePath).map((l) => l.path))];
}

/** A destination for `path` seen from folder `dir`, written like `raw`. */
function writeLike(raw: string, dir: string, path: string, suffix: string) {
  const angle = raw.startsWith("<");
  const dest = angle ? raw.slice(1, -1) : raw;
  let rel = relativePath(dir, path);
  if (dest.startsWith("./") && !rel.startsWith("../")) rel = `./${rel}`;
  // Keep the author's spelling of spaces: percent-encoded unless the
  // destination was in angle brackets.
  if (!angle && (/%20/.test(dest) || / /.test(rel))) {
    rel = rel.replace(/ /g, "%20");
  }
  const out = rel + suffix;
  return angle ? `<${out}>` : out;
}

function applyEdits(
  text: string,
  edits: { start: number; end: number; value: string }[],
): string {
  let result = "";
  let last = 0;
  for (const e of edits) {
    result += text.slice(last, e.start) + e.value;
    last = e.end;
  }
  return result + text.slice(last);
}

/**
 * In the note at `notePath`, point .md links that target `from` at `to`
 * instead (relative to the linking note). Returns the text and how many
 * links changed.
 */
export function rewriteMdLinksTo(
  text: string,
  notePath: string,
  from: string,
  to: string,
): { text: string; count: number } {
  const dir = dirOf(notePath);
  const edits = findMdLinks(text, notePath)
    .filter((l) => l.path === from)
    .map((l) => ({ ...l, value: writeLike(l.raw, dir, to, l.suffix) }))
    .filter((e) => e.value !== e.raw);
  return edits.length
    ? { text: applyEdits(text, edits), count: edits.length }
    : { text, count: 0 };
}

/**
 * The note moved from `from` to `to`: rewrite its own relative .md links so
 * they still reach the same notes (a link to itself follows it to `to`).
 */
export function rewriteMovedNoteLinks(
  text: string,
  from: string,
  to: string,
): { text: string; count: number } {
  const dir = dirOf(to);
  const edits = findMdLinks(text, from)
    .map((l) => ({
      ...l,
      value: writeLike(l.raw, dir, l.path === from ? to : l.path, l.suffix),
    }))
    .filter((e) => e.value !== e.raw);
  return edits.length
    ? { text: applyEdits(text, edits), count: edits.length }
    : { text, count: 0 };
}
