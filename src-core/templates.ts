import type { FrontMatter } from "./frontmatter.ts";
import { joinFrontMatter, splitFrontMatter } from "./frontmatter.ts";

export interface TemplateVarValues {
  [key: string]: string;
}

/**
 * Reserved template-config frontmatter keys. `pattern` names created files;
 * `type` is written into each created note's frontmatter.
 */
export const TEMPLATE_CONFIG_KEYS = ["pattern", "type"] as const;
export type TemplateConfigKey = (typeof TEMPLATE_CONFIG_KEYS)[number];

export interface TemplateMeta {
  /** Filename pattern, e.g. "{{id}}-{{title}}" or "{{date}} {{title}}". */
  pattern?: string;
  /** Template type string written into created notes' frontmatter. */
  type?: string;
}

/** Reads the reserved template-config frontmatter keys from a template. */
export function templateMeta(templateText: string): TemplateMeta {
  const { fm } = splitFrontMatter(templateText);
  const meta: TemplateMeta = {};
  if (typeof fm.pattern === "string" && fm.pattern.trim()) {
    meta.pattern = fm.pattern;
  }
  if (typeof fm.type === "string" && fm.type.trim()) {
    meta.type = fm.type;
  }
  return meta;
}

/** Edits the reserved template-config keys, preserving the body. */
export function setTemplateMeta(
  templateText: string,
  patch: Partial<TemplateMeta>,
): string {
  const { fm, body } = splitFrontMatter(templateText);
  const next: FrontMatter = { ...fm };
  const keys: TemplateConfigKey[] = ["pattern", "type"];
  for (const k of keys) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v === "") delete next[k];
    else next[k] = v;
  }
  return joinFrontMatter(next, body);
}

/** Variables available when naming a note from a template. */
export interface FileNameVars {
  title: string;
  id: string;
  author?: string;
  date?: string;
  time?: string;
  [key: string]: string | undefined;
}

/**
 * Renders a filename pattern to a safe .md file name, or null when no
 * pattern is set (caller falls back to default title+id naming). Unknown
 * placeholders are preserved so typos stay visible, then sanitized.
 */
export function fileNameForPattern(
  pattern: string | undefined,
  vars: FileNameVars,
): string | null {
  if (!pattern || !pattern.trim()) return null;
  const rendered = renderTemplate(pattern.trim(), vars as TemplateVarValues);
  const base = rendered.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
  return `${base}.md`;
}

/**
 * Replaces {{var}} placeholders. Supported built-ins:
 *   {{title}} {{date}} {{time}} {{id}} {{author}}
 * plus any caller-supplied values. Unknown vars are left intact so users
 * can spot typos instead of silently losing content.
 */
export function renderTemplate(
  templateText: string,
  vars: TemplateVarValues,
): string {
  return templateText.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, key) => {
    const v = vars[key];
    return typeof v === "string" ? v : whole;
  });
}

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function collectVars(templateText: string): string[] {
  const out = new Set<string>();
  for (const m of templateText.matchAll(VAR_RE)) out.add(m[1]);
  return [...out];
}

/**
 * Applies a template: merges its frontmatter with generated defaults,
 * renders variables across the whole document, returns final note text.
 * Template frontmatter wins only when it declares a non-empty value;
 * generated defaults (title/date/id/author) fill the rest.
 */
export function applyTemplate(
  templateText: string,
  input: {
    title: string;
    id: string;
    author?: string;
    date?: string; // ISO date
    time?: string;
    extraVars?: TemplateVarValues;
  },
): string {
  const { fm, body } = splitFrontMatter(templateText);
  const now = new Date();
  const date = input.date ?? now.toISOString().slice(0, 10);
  const time = input.time ?? now.toTimeString().slice(0, 5);

  const merged: FrontMatter = { ...fm };
  // `pattern` is naming-only metadata and must not be written into notes.
  delete merged.pattern;
  const defaults: FrontMatter = {
    title: input.title,
    date,
    ...(input.author ? { author: input.author } : {}),
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (merged[k] === undefined || merged[k] === "") merged[k] = v;
  }

  const vars: TemplateVarValues = {
    title: input.title,
    id: input.id,
    author: input.author ?? "",
    date,
    time,
    ...input.extraVars,
  };

  const renderedBody = renderTemplate(body, vars);
  const renderedFm: FrontMatter = {};
  for (const [k, v] of Object.entries(merged)) {
    renderedFm[k] = typeof v === "string"
      ? renderTemplate(v, vars)
      : Array.isArray(v)
      ? v.map((x) => typeof x === "string" ? renderTemplate(x, vars) : x)
      : v;
  }
  return joinFrontMatter(renderedFm, renderedBody);
}
