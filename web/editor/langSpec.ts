/**
 * Fenced-code-block language specs.
 *
 * The `language` node attribute holds the raw fence info string, e.g.
 * `ts`, `mermaid`, or a language plus options: `ts{1,3-5}` (highlight
 * lines 1, 3–5). It is stored verbatim in the markdown fence
 * (```` ```ts{1,3-5} ````), so the normalized form must stay space-free.
 */
export interface CodeLangSpec {
  /** Base language tag; null for plain blocks. */
  lang: string | null;
  /** 1-based line numbers selected by the `{…}` option, sorted, deduped. */
  highlightLines: number[];
}

export function parseCodeLangSpec(
  spec: string | null | undefined,
): CodeLangSpec {
  const out: CodeLangSpec = { lang: null, highlightLines: [] };
  if (!spec) return out;

  const m = /^\s*([^\s{]*)\s*(?:\{([^}]*)\})?\s*$/.exec(spec);
  if (!m) {
    // Malformed (e.g. stray braces): keep the first whitespace token so
    // at least the language survives.
    out.lang = spec.trim().split(/\s+/)[0] || null;
    return out;
  }

  const [, rawLang, rawLines] = m;
  out.lang = rawLang || null;
  if (!rawLines) return out;

  const seen = new Set<number>();
  for (const part of rawLines.split(",")) {
    const token = part.trim();
    if (!token) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    let from = 0;
    let to = 0;
    if (range) {
      from = Number(range[1]);
      to = Number(range[2]);
    } else if (/^\d+$/.test(token)) {
      from = to = Number(token);
    } else {
      continue;
    }
    if (from > to) [from, to] = [to, from];
    for (let n = from; n <= to; n++) {
      if (!seen.has(n)) {
        seen.add(n);
        out.highlightLines.push(n);
      }
    }
  }
  out.highlightLines.sort((a, b) => a - b);
  return out;
}

/** Canonical, space-free form used both in the doc attribute and fences. */
export function formatCodeLangSpec(
  lang: string | null | undefined,
  highlightLines: Iterable<number> = [],
): string | null {
  const lines = [...new Set(highlightLines)].sort((a, b) => a - b);
  const l = (lang ?? "").trim();
  const spec = `${l}${lines.length ? `{${lines.join(",")}}` : ""}`;
  return spec || null;
}

/**
 * Normalize free-form user input (from the chip editor) into canonical
 * form. Returns null for an empty/plain block.
 */
export function normalizeCodeLangSpec(raw: string): string | null {
  const { lang, highlightLines } = parseCodeLangSpec(raw);
  return formatCodeLangSpec(lang, highlightLines);
}
