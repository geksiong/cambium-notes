import { splitFrontMatter, tagsFromFrontMatter } from "./frontmatter.ts";

const WIKILINK_RE = /\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_/-]{2,64})/gu;
const FENCE_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

export function stripCodeBlocks(body: string): string {
  return body.replace(FENCE_RE, "");
}

export function extractWikilinks(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(WIKILINK_RE)) {
    const target = m[1].trim();
    if (target) out.add(target);
  }
  return [...out];
}

export function extractInlineTags(body: string): string[] {
  const clean = stripCodeBlocks(body);
  const out = new Set<string>();
  for (const m of clean.matchAll(TAG_RE)) out.add(m[2]);
  return [...out];
}

/**
 * Resolves a wikilink target against known note paths.
 * Order: exact path → path suffix → basename → slugified basename.
 * Always returns one of the given canonical paths, or null.
 */
export function resolveLink(
  target: string,
  paths: string[],
): string | null {
  const norm = normalize(target);
  const exact = paths.find((p) => normalize(p) === norm);
  if (exact) return exact;
  const suffix = paths.find((p) => normalize(p).endsWith(`/${norm}`));
  if (suffix) return suffix;
  const base = baseName(norm);
  const byBase = paths.find((p) => baseName(normalize(p)) === base);
  if (byBase) return byBase;
  const slug = slugify(base);
  return paths.find((p) => slugify(baseName(normalize(p))) === slug) ?? null;
}

export function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function normalize(p: string): string {
  return p.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\.md$/, "");
}

export interface LinkScan {
  links: string[];
  tags: string[];
}

export function scanNote(text: string, fmTags = true): LinkScan {
  const { fm, body } = splitFrontMatter(text);
  const tags = new Set(extractInlineTags(body));
  if (fmTags) { for (const t of tagsFromFrontMatter(fm)) tags.add(t); }
  return { links: extractWikilinks(body), tags: [...tags] };
}
