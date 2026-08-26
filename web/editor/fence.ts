/**
 * Expressive Code opening-fence parsing.
 *
 * The `language` node attribute holds the verbatim opening-fence info
 * string (everything after ```), e.g.
 * `ts {1, 4, 7-8} title="demo.ts" ins={2} "search me" /re[gx]/ wrap`.
 * It is stored verbatim in the markdown fence, so anything expressible in
 * Expressive Code round-trips through the document unchanged.
 *
 * Meta parsing delegates to @expressive-code/core's own `MetaOptions`, so
 * the editor understands exactly the grammar that expressive-code renders
 * at publish time. Only feature *rendering* differs (see highlight.ts):
 * publish-time-only options such as frames, collapse or preserveIndent are
 * parsed but simply have no live representation.
 */

import { MetaOptions } from "@expressive-code/core";

export type MarkerType = "mark" | "ins" | "del";

const MARKER_TYPES: readonly MarkerType[] = ["mark", "ins", "del"];

/** One marked line-range group from the fence (e.g. `ins={"A":6-7:8-10}`). */
export interface MarkerGroup {
  type: MarkerType;
  label: string | null;
  /** Inclusive 1-based line range. */
  from: number;
  to: number;
  /** Optional inclusive 1-based column range applied to every line. */
  cols: [number, number] | null;
}

export interface InlineMarker {
  type: MarkerType;
  /** Plaintext search string (quoted in the fence). */
  text?: string;
  /** Flag-less regular expression (slash-delimited in the fence). */
  regex?: RegExp;
}

export interface FenceInfo {
  /** First word of the info string ("ts", "mermaid", "diff", …). */
  lang: string | null;
  /** Everything after the language word, verbatim. */
  meta: string | null;
  /** `title="…"` option. */
  title: string | null;
  /** `wrap` / `!wrap` flag. */
  wrap: boolean;
  /** True when the fence language is `diff`. */
  isDiff: boolean;
  /**
   * Language used for syntax highlighting: the plain language, or the
   * `lang="…"` attribute on diff blocks (EC's way to keep highlighting
   * while using diff-like +/- markers).
   */
  hlLang: string | null;
  lineMarkers: MarkerGroup[];
  inlineMarkers: InlineMarker[];
}

const EMPTY_INFO: FenceInfo = Object.freeze({
  lang: null,
  meta: null,
  title: null,
  wrap: false,
  isDiff: false,
  hlLang: null,
  lineMarkers: [],
  inlineMarkers: [],
});

/** Optional quoted label in front of a range value, e.g. `"A":6-10`. */
const LABEL_RE =
  /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*:\s*([\s\S]*)$/;

/**
 * One item inside a `{…}` selection: `4`, `7-8` or `6-7:8-10`
 * (the latter marks columns 8–10 on lines 6 and 7).
 */
const RANGE_ITEM_RE = /^(\d+)(?:-(\d+))?(?::(\d+)-(\d+))?$/;

function unquote(value: string): string {
  return value.replace(/\\(['"\\])/g, "$1");
}

function markerTypeFor(key: string): MarkerType {
  return key === "" || key === "mark"
    ? "mark"
    : key === "ins"
    ? "ins"
    : "del";
}

function parseRangeValue(type: MarkerType, value: string): MarkerGroup[] {
  let rest = value.trim();
  let label: string | null = null;
  const labeled = LABEL_RE.exec(rest);
  if (labeled) {
    label = unquote(labeled[1] ?? labeled[2] ?? "");
    rest = labeled[3].trim();
  }
  const groups: MarkerGroup[] = [];
  for (const part of rest.split(",")) {
    const m = RANGE_ITEM_RE.exec(part.trim());
    if (!m) continue;
    let from = Number(m[1]);
    let to = m[2] !== undefined ? Number(m[2]) : from;
    if (from > to) [from, to] = [to, from];
    const cols: [number, number] | null = m[3] !== undefined
      ? [
        Math.max(1, Number(m[3])),
        Math.max(Number(m[3]), Number(m[4] ?? m[3])),
      ]
      : null;
    groups.push({ type, label, from, to, cols });
  }
  return groups;
}

function parseBooleans(opts: MetaOptions, key: string): boolean[] {
  const values: boolean[] = [];
  for (const opt of opts.list()) {
    if (
      opt.kind === "boolean" &&
      (opt.key === key || opt.key === `!${key}`)
    ) {
      values.push(opt.key === `!${key}` ? !opt.value : opt.value);
    }
  }
  return values;
}

/**
 * Parse a verbatim opening-fence info string. Never throws: malformed
 * parts are skipped, and an empty/plain fence yields `EMPTY_INFO`.
 */
export function parseFence(raw: string | null | undefined): FenceInfo {
  const trimmed = raw?.trim();
  if (!trimmed) return EMPTY_INFO;

  // First whitespace-delimited word is the language; the rest is meta.
  // Legacy space-free specs (`ts{1,3-5}`) move their braces into the meta.
  const head = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!head) return EMPTY_INFO;
  let lang: string | null = head[1];
  let meta = head[2] ?? "";

  const legacy = /^([^{}\s]+)\{([\s\S]*)\}$/.exec(lang);
  if (legacy) {
    lang = legacy[1];
    meta = `{${legacy[2]}}${meta ? ` ${meta}` : ""}`;
  }

  const opts = new MetaOptions(meta);
  const isDiff = lang.toLowerCase() === "diff";
  const langAttr = opts.getString("lang");

  const lineMarkers: MarkerGroup[] = [];
  for (const key of ["", ...MARKER_TYPES]) {
    const type = markerTypeFor(key);
    for (const value of opts.getRanges(key)) {
      lineMarkers.push(...parseRangeValue(type, value));
    }
  }

  const inlineMarkers: InlineMarker[] = [];
  for (const key of ["", ...MARKER_TYPES]) {
    const type = markerTypeFor(key);
    for (const text of opts.getStrings(key)) {
      inlineMarkers.push({ type, text });
    }
    for (const regex of opts.getRegExps(key)) {
      inlineMarkers.push({ type, regex });
    }
  }

  return {
    lang,
    meta,
    title: opts.getString("title") ?? null,
    wrap: parseBooleans(opts, "wrap").at(-1) ?? false,
    isDiff,
    hlLang: (isDiff ? langAttr : null) ?? lang,
    lineMarkers,
    inlineMarkers,
  };
}

/** Convenience: the base language word of a fence info string. */
export function fenceBaseLang(raw: string | null | undefined): string | null {
  return parseFence(raw).lang;
}

/**
 * Patch a markdown-it instance's fence renderer so the FULL opening-fence
 * info string (language + meta) lands on the `<code>` element as
 * `data-info`. Without this, only the first whitespace-delimited word
 * survives rendering (markdown-it puts just the language word into the
 * `language-…` class), losing all Expressive Code meta on reload.
 * Pair with a `language.parseHTML` that prefers `data-info`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function patchFenceRenderer(markdownit: any): void {
  const original = markdownit.renderer.rules.fence;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markdownit.renderer.rules.fence = (...args: any[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = args[0][args[1] as number];
    token.attrSet(
      "data-info",
      token.info ? markdownit.utils.unescapeAll(token.info).trim() : "",
    );
    return original(...args);
  };
}
