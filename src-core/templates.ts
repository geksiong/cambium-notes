import type { FrontMatter } from "./frontmatter.ts";
import { joinFrontMatter, splitFrontMatter } from "./frontmatter.ts";

export interface TemplateVarValues {
  [key: string]: string;
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
