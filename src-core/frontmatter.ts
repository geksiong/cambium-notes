import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type FrontMatter = Record<string, unknown>;

const YAML_DELIM = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface SplitResult {
  /** Raw frontmatter text including delimiters, or null when absent. */
  fmRaw: string | null;
  fm: FrontMatter;
  body: string;
}

export function splitFrontMatter(text: string): SplitResult {
  const m = YAML_DELIM.exec(text);
  if (!m) return { fmRaw: null, fm: {}, body: text };
  let fm: FrontMatter = {};
  try {
    const parsed = parseYaml(m[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      fm = parsed as FrontMatter;
    }
  } catch {
    // Malformed YAML: keep raw, expose empty object. Never lose user bytes.
  }
  const body = text.slice(m[0].length).replace(/^\r?\n/, "");
  return { fmRaw: m[0], fm, body };
}

export function hasFrontMatter(text: string): boolean {
  return YAML_DELIM.test(text);
}

/**
 * Serializes frontmatter to a YAML fragment (no --- fences) for the text
 * editor mode of the frontmatter panel.
 */
export function stringifyFrontMatterYaml(fm: FrontMatter): string {
  return fm && Object.keys(fm).length > 0 ? stringifyYaml(fm) : "";
}

/**
 * Parses a YAML fragment into frontmatter. Returns null for malformed input
 * or non-mapping documents so callers can keep their last valid value.
 */
export function parseFrontMatterYaml(text: string): FrontMatter | null {
  try {
    const parsed = text.trim() === "" ? {} : parseYaml(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as FrontMatter;
    }
  } catch {
    // Malformed YAML: signal the caller instead of losing their keystrokes.
  }
  return null;
}

/** Rebuilds a note from (possibly edited) frontmatter and an untouched body. */
export function joinFrontMatter(fm: FrontMatter, body: string): string {
  if (!fm || Object.keys(fm).length === 0) return body;
  const yaml = stringifyYaml(fm).trimEnd();
  return `---\n${yaml}\n---\n\n${body}`;
}

export function titleFromNote(path: string, fm: FrontMatter): string {
  if (typeof fm.title === "string" && fm.title.trim()) {
    return fm.title.trim();
  }
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

export function tagsFromFrontMatter(fm: FrontMatter): string[] {
  const raw = fm.tags;
  if (typeof raw === "string") {
    return raw.split(/[,\s]+/).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === "string");
  }
  return [];
}

export function isDraft(fm: FrontMatter): boolean {
  return fm.draft === true || fm.draft === "true";
}
