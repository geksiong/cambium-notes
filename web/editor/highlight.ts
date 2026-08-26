/**
 * Syntax highlighting + Expressive Code fence-feature rendering for fenced
 * code blocks.
 *
 * Shiki (the same TextMate engine VS Code uses, and the highlighter behind
 * expressive-code) tokenises each block's code; the tokens become
 * ProseMirror inline decorations so they render inside the editable
 * contentDOM without touching the document model.
 *
 * On top of plain highlighting, the opening-fence features parsed by
 * fence.ts are rendered live:
 * - `{4}`, `{1, 4, 7-8}`, `mark={…}`   neutral line highlights
 * - `ins={…}` / `del={…}`              inserted/deleted line highlights
 * - `{6-7:8-10}` column selections     inline highlights
 * - `"text"` / `/re[gx]/` (+ typed)    inline text markers
 * - `{"label":6-10}`                   labels shown on the marked range
 * - ```diff fences                     +/- lines as ins/del (markers stay
 *                                      visible — decorations cannot alter
 *                                      document text)
 *
 * Token colors come from a light/dark Shiki theme pair and are mapped to
 * generated classes (`ec-tok-*`) whose CSS rules are injected at runtime,
 * switching with the app theme (`:root[data-theme="light"]`).
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { bundledLanguages, createHighlighter } from "shiki";
import type { BundledLanguage, Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { parseFence, type FenceInfo } from "./fence.ts";

/** Dark-first palette: the app's default theme, overridden under [data-theme="light"]. */
const THEMES = {
  light: "github-light",
  dark: "github-dark",
} as const;

// ---------------------------------------------------------------------------
// Shiki engine (async init + lazy language loading)
// ---------------------------------------------------------------------------

let highlighter: Highlighter | null = null;
const loadedLangs = new Set<string>();
const pendingLangs = new Set<string>();
/**
 * Bumped whenever tokenizer availability changes (engine ready, language
 * loaded). Part of the per-block cache key so decoration specs computed
 * before Shiki/its languages were available get rebuilt on the refresh
 * pass instead of being reused without syntax colors.
 */
let engineVersion = 0;

/**
 * Transaction meta key that forces decoration recomputation (used when a
 * language finishes loading asynchronously).
 */
export const HL_REFRESH = "ecHighlightRefresh";

const refreshListeners = new Set<() => void>();

function notifyAll(): void {
  engineVersion++;
  for (const fn of [...refreshListeners]) fn();
}

/**
 * Register a callback invoked whenever a language finishes loading (and
 * once when the highlighter itself becomes ready), so the editor plugin
 * can recompute decorations. Returns an unregister function so multiple
 * editors (e.g. React StrictMode double-mounts) don't clear each other.
 */
export function setHighlightRefreshNotify(fn: () => void): () => void {
  refreshListeners.add(fn);
  return () => refreshListeners.delete(fn);
}

/** Test/debug introspection: current tokenizer availability. */
export function highlighterState(): {
  ready: boolean;
  langs: string[];
  version: number;
} {
  return {
    ready: highlighter !== null,
    langs: [...loadedLangs],
    version: engineVersion,
  };
}

function getHighlighter(): Promise<Highlighter> {
  return createHighlighter({
    themes: Object.values(THEMES),
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
}

if (typeof window !== "undefined") {
  getHighlighter()
    .then((hl) => {
      highlighter = hl;
      notifyAll();
    })
    .catch((e) => console.error("Shiki init failed:", e));
}

function requestLanguage(lang: string): void {
  if (!highlighter || loadedLangs.has(lang) || pendingLangs.has(lang)) return;
  // Fence languages are user input; the runtime check below is what makes
  // unknown languages safe (the cast only satisfies the strict index type).
  const bundle = bundledLanguages[lang as BundledLanguage];
  if (!bundle) return; // unknown language — stays unhighlighted
  pendingLangs.add(lang);
  highlighter
    .loadLanguage(bundle)
    .then(() => {
      loadedLangs.add(lang);
      notifyAll();
    })
    .catch(() => {})
    .finally(() => pendingLangs.delete(lang));
}

// ---------------------------------------------------------------------------
// Runtime-generated token color classes
// ---------------------------------------------------------------------------

const TOKEN_STYLE_ID = "ec-token-colors";

let styleEl: HTMLStyleElement | null = null;
const colorClasses = new Map<string, string>();

function ensureStyleEl(): HTMLStyleElement {
  if (!styleEl) {
    styleEl = document.getElementById(TOKEN_STYLE_ID) as HTMLStyleElement ??
      document.head.appendChild(document.createElement("style"));
    styleEl.id = TOKEN_STYLE_ID;
  }
  return styleEl;
}

/** Stable class for a (light, dark) color pair; injects its CSS rules.
 * The app's DEFAULT theme is dark, so the dark palette goes on the base
 * rule and the light palette under the `data-theme="light"` override —
 * mirroring how the static styles.css is written. */
function tokenClass(light?: string, dark?: string): string | null {
  if (!light && !dark) return null;
  const l = light ?? dark!;
  const d = dark ?? light!;
  const key = `${l}|${d}`;
  let cls = colorClasses.get(key);
  if (!cls) {
    cls = `ec-tok-${colorClasses.size.toString(36)}`;
    colorClasses.set(key, cls);
    const sheet = ensureStyleEl().sheet;
    sheet?.insertRule(`.prose-host .${cls}{color:${d}}`);
    sheet?.insertRule(
      `:root[data-theme="light"] .prose-host .${cls}{color:${l}}`,
    );
  }
  return cls;
}

// ---------------------------------------------------------------------------
// Decoration construction
// ---------------------------------------------------------------------------

interface DecoSpec {
  /** Offset from the start of the block's content. */
  from: number;
  to: number;
  attrs: Record<string, string>;
  /**
   * Render as a zero-width inline widget at `from` instead of an inline
   * decoration. Used for the marker accent bars: PM splits inline
   * decorations into one span per token boundary, so painting the bar via
   * the range itself would draw it on every fragment. A widget exists
   * exactly once per line.
   */
  widget?: boolean;
}

interface CacheEntry {
  key: string;
  text: string;
  /** engineVersion at build time — stale entries are rebuilt. */
  version: number;
  specs: DecoSpec[];
}

/** Per-node memo so unchanged blocks aren't re-tokenised on every keystroke. */
const cache = new WeakMap<ProseMirrorNode, CacheEntry>();

function lineStarts(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function tokenSpecs(hl: Highlighter, text: string, lang: string): DecoSpec[] {
  let tokens: ReturnType<Highlighter["codeToTokens"]>["tokens"];
  try {
    ({ tokens } = hl.codeToTokens(text, {
      lang: lang as BundledLanguage,
      themes: THEMES,
      defaultColor: false,
    }));
  } catch {
    return [];
  }
  const specs: DecoSpec[] = [];
  for (const line of tokens) {
    for (const token of line) {
      if (!token.content.trim()) continue; // whitespace needs no color class
      // With defaultColor:false, shiki v4 emits one CSS variable per
      // configured theme, keyed positionally ("light"/"dark"), NOT by
      // theme name.
      const cls = tokenClass(
        token.htmlStyle?.["--shiki-light"],
        token.htmlStyle?.["--shiki-dark"],
      );
      if (!cls) continue;
      const from = token.offset;
      specs.push({
        from,
        to: from + token.content.length,
        attrs: { class: cls },
      });
    }
  }
  return specs;
}

/** Yield inclusive [start, end] offsets of every match within `lineText`. */
function* matchRanges(
  marker: FenceInfo["inlineMarkers"][number],
  lineText: string,
): Generator<[number, number]> {
  if (marker.text !== undefined) {
    const needle = marker.text;
    if (!needle.length) return;
    let idx = lineText.indexOf(needle);
    while (idx !== -1) {
      yield [idx, idx + needle.length];
      idx = lineText.indexOf(needle, idx + needle.length);
    }
    return;
  }
  const regex = marker.regex!;
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(lineText)) !== null) {
    // Capture-group semantics (EC): mark each participating group instead
    // of the whole match. RegExp 'd' flag (added by MetaOptions) gives us
    // exact group positions.
    if (match.indices && match.length > 1) {
      for (let g = 1; g < match.indices.length; g++) {
        const range = match.indices[g];
        if (range) yield [range[0], range[1]];
      }
    } else if (match[0].length) {
      yield [match.index, match.index + match[0].length];
    }
    if (match[0].length === 0) re.lastIndex++;
  }
}

function markerSpecs(text: string, info: FenceInfo): DecoSpec[] {
  const specs: DecoSpec[] = [];
  const lines = text.split("\n");
  const starts = lineStarts(text);
  const lineCount = lines.length;

  // One accent bar per (line, marker type), drawn as a widget so PM's
  // token-span splitting can't duplicate it.
  const accents = new Set<string>();
  const pushAccent = (offset: number, type: string) => {
    const key = `${offset}|${type}`;
    if (accents.has(key)) return;
    accents.add(key);
    specs.push({
      from: offset,
      to: offset,
      widget: true,
      attrs: { class: `ec-accent-${type}` },
    });
  };

  const fullLine = (
    lineNo: number,
    type: string,
    extra?: Record<string, string>,
  ) => {
    const len = lines[lineNo - 1].length;
    if (!len) return;
    specs.push({
      from: starts[lineNo - 1],
      to: starts[lineNo - 1] + len,
      attrs: { class: `ec-line-${type}`, ...extra },
    });
    pushAccent(starts[lineNo - 1], type);
  };

  // diff-like fences: leading +/- marks inserted/deleted lines. The prefix
  // characters themselves stay visible (we cannot rewrite document text).
  if (info.isDiff) {
    for (let n = 1; n <= lineCount; n++) {
      const prefix = /^[+-]/.exec(lines[n - 1]);
      if (prefix) fullLine(n, prefix[0] === "+" ? "ins" : "del");
    }
  }

  for (const group of info.lineMarkers) {
    const from = Math.max(1, group.from);
    const to = Math.min(lineCount, group.to);
    let labelled = false;
    for (let n = from; n <= to; n++) {
      if (group.cols) {
        const line = lines[n - 1];
        const start = starts[n - 1] + Math.max(0, group.cols[0] - 1);
        const end = starts[n - 1] +
          Math.min(line.length, group.cols[1]);
        if (end > start) {
          specs.push({
            from: start,
            to: end,
            attrs: { class: `ec-inline-${group.type}` },
          });
          // Labels need a span to attach to; first marked line wins.
          if (!labelled && group.label) {
            labelled = true;
            specs.push({
              from: start,
              to: end,
              attrs: { "data-ec-label": group.label },
            });
          }
        }
        continue;
      }
      fullLine(n, group.type);
      if (!labelled && group.label) {
        // Labels need a non-empty span; fall forward to the next line.
        const anchor = lines.findIndex((l, i) => i >= n - 1 && i < to && l.length);
        if (anchor !== -1) {
          labelled = true;
          fullLine(anchor + 1, group.type, {
            "data-ec-label": group.label,
          });
        }
      }
    }
  }

  for (const marker of info.inlineMarkers) {
    for (let n = 1; n <= lineCount; n++) {
      const line = lines[n - 1];
      if (!line) continue;
      const offset = starts[n - 1];
      for (const [start, end] of matchRanges(marker, line)) {
        if (end > start) {
          specs.push({
            from: offset + start,
            to: offset + end,
            attrs: { class: `ec-inline-${marker.type}` },
          });
        }
      }
    }
  }

  return specs;
}

function buildSpecs(text: string, info: FenceInfo): DecoSpec[] {
  const specs: DecoSpec[] = [];
  const lang = info.hlLang;
  if (lang) {
    if (highlighter && loadedLangs.has(lang)) {
      specs.push(...tokenSpecs(highlighter, text, lang));
    } else {
      requestLanguage(lang);
    }
  }
  specs.push(...markerSpecs(text, info));
  return specs;
}

/**
 * Compute all decorations for every code-block node in `doc`.
 * Returns an empty set (not null) so callers can always `.map()` it.
 */
export function highlightDecorations(
  doc: ProseMirrorNode,
  blockTypeName: string,
): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== blockTypeName) return true;
    const raw = (node.attrs.language as string | null) ?? "";
    const text = node.textContent ?? "";

    let entry = cache.get(node);
    if (
      !entry || entry.key !== raw || entry.text !== text ||
      entry.version !== engineVersion
    ) {
      entry = {
        key: raw,
        text,
        version: engineVersion,
        specs: buildSpecs(text, parseFence(raw)),
      };
      cache.set(node, entry);
    }

    const contentStart = pos + 1; // first position inside the block
    for (const spec of entry.specs) {
      if (spec.widget) {
        decorations.push(
          Decoration.widget(
            contentStart + spec.from,
            () => {
              const el = document.createElement("span");
              el.className = spec.attrs.class;
              return el;
            },
            { side: -1 },
          ),
        );
        continue;
      }
      decorations.push(
        Decoration.inline(contentStart + spec.from, contentStart + spec.to, {
          ...spec.attrs,
        }),
      );
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}
