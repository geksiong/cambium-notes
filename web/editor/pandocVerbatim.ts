/**
 * markdown-it rules that keep Pandoc constructs the editor has no
 * structured node for *verbatim*, so saving can't change how Pandoc renders
 * them. A false positive only means some text shows as source in the
 * editor; a false negative would let the serializer reflow or escape it, so
 * detection errs on the liberal side.
 *
 * Block constructs → `source_block` tokens (rendered as `sourceBlock`):
 * definition lists, line blocks, Pandoc-only list markers (`a.`, `i.`,
 * `#.`, `(@)`, `(1)`…), grid / simple / multiline tables, `\begin{…}` TeX
 * environments, footnote definitions and raw HTML blocks.
 *
 * Inline constructs → `source_inline` tokens (rendered as `sourceInline`):
 * footnote references `[^id]`, inline notes `^[…]`, citations `[@key]` /
 * `@key [p. 3]`, raw TeX commands `\cmd{…}`, Pandoc-only escapes (`\ `,
 * non-ASCII punctuation) and inline HTML.
 *
 * `~sub~` / `^sup^` become real marks (see pandoc.ts).
 */

type MdState = any;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isBlank(state: MdState, line: number): boolean {
  return state.bMarks[line] + state.tShift[line] >= state.eMarks[line];
}

/** Line text with leading indentation stripped. */
function lineText(state: MdState, line: number): string {
  return state.src.slice(
    state.bMarks[line] + state.tShift[line],
    state.eMarks[line],
  );
}

/** Line text keeping indentation beyond the enclosing block's indent. */
function rawLine(state: MdState, line: number): string {
  const s = state.src.slice(state.bMarks[line], state.eMarks[line]);
  return s.replace(new RegExp(`^ {0,${state.blkIndent}}`), "").trimEnd();
}

/** Indentation of `line` relative to the enclosing block. */
function relIndent(state: MdState, line: number): number {
  return state.sCount[line] - state.blkIndent;
}

function pushSourceBlock(
  state: MdState,
  kind: string,
  startLine: number,
  endLine: number,
): void {
  // Drop trailing blank lines from the verbatim range.
  let end = endLine;
  while (end > startLine + 1 && isBlank(state, end - 1)) end--;
  const lines: string[] = [];
  for (let l = startLine; l < end; l++) lines.push(rawLine(state, l));
  const token = state.push("source_block", "pre", 0);
  token.block = true;
  token.map = [startLine, end];
  token.meta = { kind, raw: lines.join("\n") };
  state.line = endLine;
}

/**
 * End (exclusive) of a block that runs until a blank line, then continues
 * only while the next non-blank line is indented (≥ `contIndent`) or
 * satisfies `continues`.
 */
function scanBlock(
  state: MdState,
  startLine: number,
  endLine: number,
  contIndent: number,
  continues: (line: number) => boolean,
): number {
  let l = startLine + 1;
  while (l < endLine) {
    if (!isBlank(state, l)) {
      if (state.sCount[l] < state.blkIndent) break; // dedented out of parent
      l++;
      continue;
    }
    let n = l;
    while (n < endLine && isBlank(state, n)) n++;
    if (n >= endLine || state.sCount[n] < state.blkIndent) break;
    if (relIndent(state, n) >= contIndent || continues(n)) {
      l = n + 1;
      continue;
    }
    break;
  }
  return l;
}

/** End of a block made of consecutive non-blank lines. */
function scanParagraphLike(state: MdState, startLine: number, endLine: number) {
  let l = startLine + 1;
  while (
    l < endLine && !isBlank(state, l) && state.sCount[l] >= state.blkIndent
  ) l++;
  return l;
}

type BlockRule = (
  state: MdState,
  startLine: number,
  endLine: number,
  silent: boolean,
) => boolean;

/** Wraps a detector into a block rule that emits a verbatim block. */
function verbatimRule(
  kind: string,
  detect: (state: MdState, startLine: number, endLine: number) => number,
): BlockRule {
  return (state, startLine, endLine, silent) => {
    if (relIndent(state, startLine) >= 4) return false;
    const end = detect(state, startLine, endLine);
    if (end <= startLine) return false;
    if (!silent) pushSourceBlock(state, kind, startLine, end);
    return true;
  };
}

// ---------------------------------------------------------------------------
// block detectors (each returns the exclusive end line, or -1)
// ---------------------------------------------------------------------------

const DEF_MARKER_RE = /^[:~](?:[ \t]|$)/;

function isDefMarker(state: MdState, line: number): boolean {
  const rel = relIndent(state, line);
  return rel >= 0 && rel < 4 && DEF_MARKER_RE.test(lineText(state, line));
}

/** A one-line term followed (optionally after one blank) by `:`/`~`. */
function isTerm(state: MdState, line: number, endLine: number): boolean {
  if (isBlank(state, line) || isDefMarker(state, line)) return false;
  const next = line + 1;
  if (next < endLine && isDefMarker(state, next)) return true;
  return next + 1 < endLine && isBlank(state, next) &&
    isDefMarker(state, next + 1);
}

function detectDefList(state: MdState, start: number, end: number): number {
  if (!isTerm(state, start, end)) return -1;
  return scanBlock(
    state,
    start,
    end,
    4,
    (n) => isDefMarker(state, n) || isTerm(state, n, end),
  );
}

function detectLineBlock(state: MdState, start: number, end: number): number {
  if (!/^\|(?:\s|$)/.test(lineText(state, start))) return -1;
  return scanParagraphLike(state, start, end);
}

/**
 * List markers Pandoc (fancy_lists, example_lists, `#.`) accepts but
 * CommonMark doesn't: letters, roman numerals, `#`, `@label`, and the
 * `(x)` form (including `(1)`). Uppercase letter + "." needs two spaces,
 * as in Pandoc (so "B. Russell" stays a paragraph).
 */
const FANCY_MARKER_RE = new RegExp(
  String.raw`^(?:\((?:[a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+|\d+|#|@[\w-]*)\)` +
    String.raw`|(?:[a-z]|[ivxlcdm]+|[IVXLCDM]+|#|@[\w-]*)[.)]` +
    String.raw`|[A-Z]\))(?:[ \t]+|$)` +
    String.raw`|^[A-Z]\.(?: {2,}|\t)`,
);

function isFancyItem(state: MdState, line: number): boolean {
  const rel = relIndent(state, line);
  return rel >= 0 && rel < 4 &&
    FANCY_MARKER_RE.test(lineText(state, line));
}

function detectFancyList(state: MdState, start: number, end: number): number {
  if (!isFancyItem(state, start)) return -1;
  return scanBlock(state, start, end, 1, (n) => isFancyItem(state, n));
}

const GRID_BORDER_RE = /^\+(?:[-=:]+\+)+\s*$/;
const DASH_GROUPS_RE = /^-+(?:[ \t]+-+)+\s*$/;
const DASH_LINE_RE = /^-{3,}\s*$/;

function detectGridTable(state: MdState, start: number, end: number): number {
  if (!GRID_BORDER_RE.test(lineText(state, start))) return -1;
  return scanParagraphLike(state, start, end);
}

function detectSimpleTable(state: MdState, start: number, end: number) {
  const first = lineText(state, start);
  // Headerless simple table: column-dash lines above and below the rows
  // (a lone `- - -` is a horizontal rule).
  if (DASH_GROUPS_RE.test(first)) {
    const stop = scanParagraphLike(state, start, end);
    return stop - 1 > start + 1 &&
        DASH_GROUPS_RE.test(lineText(state, stop - 1))
      ? stop
      : -1;
  }
  // Header line followed by a column-dash line with ≥ 2 columns.
  if (
    start + 1 < end && !isBlank(state, start + 1) &&
    DASH_GROUPS_RE.test(lineText(state, start + 1))
  ) return scanParagraphLike(state, start, end);
  return -1;
}

function detectMultilineTable(
  state: MdState,
  start: number,
  end: number,
): number {
  if (!DASH_LINE_RE.test(lineText(state, start))) return -1;
  if (start + 1 >= end || isBlank(state, start + 1)) return -1;
  let sawColumns = false;
  for (let l = start + 1; l < end; l++) {
    if (state.sCount[l] < state.blkIndent && !isBlank(state, l)) return -1;
    const t = lineText(state, l);
    if (DASH_GROUPS_RE.test(t)) sawColumns = true;
    else if (
      DASH_LINE_RE.test(t) && (l + 1 >= end || isBlank(state, l + 1))
    ) return sawColumns ? l + 1 : -1;
  }
  return -1;
}

function detectTexEnv(state: MdState, start: number, end: number): number {
  const m = /^\\begin\{([^}]+)\}/.exec(lineText(state, start));
  if (!m) return -1;
  const close = `\\end{${m[1]}}`;
  for (let l = start; l < end; l++) {
    if (lineText(state, l).includes(close)) return l + 1;
  }
  return -1;
}

/**
 * A block starting with `: ` — a table caption (or a definition whose term
 * sits above a blank line). Kept verbatim, so text that merely *starts*
 * with ": " can be escaped safely on save.
 */
function detectColonBlock(state: MdState, start: number, end: number) {
  if (!/^:(?:[ \t]|$)/.test(lineText(state, start))) return -1;
  return scanParagraphLike(state, start, end);
}

function detectFootnoteDef(state: MdState, start: number, end: number) {
  if (!/^\[\^[^\]\s]+\]:/.test(lineText(state, start))) return -1;
  return scanBlock(state, start, end, 4, () => false);
}

// ---------------------------------------------------------------------------
// inline rules
// ---------------------------------------------------------------------------

function pushSourceInline(state: MdState, kind: string, raw: string): void {
  const token = state.push("source_inline", "", 0);
  token.meta = { kind, raw };
}

/** `[^id]` footnote reference. */
function footnoteRefRule(state: MdState, silent: boolean): boolean {
  const rest = state.src.slice(state.pos, state.posMax);
  const m = /^\[\^[^\]\s]+\]/.exec(rest);
  if (!m) return false;
  if (!silent) pushSourceInline(state, "footnote", m[0]);
  state.pos += m[0].length;
  return true;
}

/** `^[inline note]`. */
function inlineNoteRule(state: MdState, silent: boolean): boolean {
  const { src, pos } = state;
  if (src[pos] !== "^" || src[pos + 1] !== "[") return false;
  const end = state.md.helpers.parseLinkLabel(state, pos + 1, false);
  if (end < 0) return false;
  if (!silent) pushSourceInline(state, "footnote", src.slice(pos, end + 1));
  state.pos = end + 1;
  return true;
}

const CITE_IN_LABEL_RE = /(?:^|[\s;[\-])-?@[\p{L}\p{N}_]/u;

/** `[see @doe, p. 3; @smith]` bracketed citation. */
function bracketCitationRule(state: MdState, silent: boolean): boolean {
  const { src, pos } = state;
  if (src[pos] !== "[") return false;
  const end = state.md.helpers.parseLinkLabel(state, pos, false);
  if (end < 0) return false;
  if (!CITE_IN_LABEL_RE.test(src.slice(pos + 1, end))) return false;
  if ("([{".includes(src[end + 1] ?? "")) return false; // link / span
  if (!silent) pushSourceInline(state, "citation", src.slice(pos, end + 1));
  state.pos = end + 1;
  return true;
}

const CITE_KEY_RE =
  /^-?@[\p{L}\p{N}_](?:[\p{L}\p{N}_:.#$%&+?<>~/-]*[\p{L}\p{N}_])?/u;

/** `@key` / `-@key`, plus a directly following `[locator]`. */
function bareCitationRule(state: MdState, silent: boolean): boolean {
  const { src, pos } = state;
  const c = src[pos];
  if (c !== "@" && !(c === "-" && src[pos + 1] === "@")) return false;
  const prev = pos > 0 ? src[pos - 1] : "";
  if (prev && /[\p{L}\p{N}_]/u.test(prev)) return false; // e-mail etc.
  const m = CITE_KEY_RE.exec(src.slice(pos, state.posMax));
  if (!m) return false;
  let end = pos + m[0].length;
  const after = /^ ?\[/.exec(src.slice(end, state.posMax));
  if (after) {
    const close = state.md.helpers.parseLinkLabel(
      state,
      end + after[0].length - 1,
      false,
    );
    if (close > 0 && !"([{".includes(src[close + 1] ?? "")) end = close + 1;
  }
  if (!silent) pushSourceInline(state, "citation", src.slice(pos, end));
  state.pos = end;
  return true;
}

/** Index after a balanced `{…}` / `[…]` group starting at `i`, or -1. */
function skipGroup(src: string, i: number, max: number): number {
  const open = src[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let j = i; j < max; j++) {
    const ch = src[j];
    if (ch === "\\") {
      j++;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return j + 1;
    else if (ch === "\n" && open === "[") return -1;
  }
  return -1;
}

/**
 * `\command` with its `{…}`/`[…]` arguments (Pandoc raw_tex), and the
 * escapes Pandoc accepts beyond CommonMark's ASCII punctuation: `\ `
 * (non-breaking space) and `\` + non-ASCII punctuation/symbol.
 */
function backslashRule(state: MdState, silent: boolean): boolean {
  const { src, pos } = state;
  const max = state.posMax;
  if (src[pos] !== "\\" || pos + 1 >= max) return false;
  const next = src.codePointAt(pos + 1)!;
  const nextCh = String.fromCodePoint(next);
  let end: number;
  if (/[A-Za-z]/.test(nextCh)) {
    end = pos + 1;
    while (end < max && /[A-Za-z]/.test(src[end])) end++;
    for (;;) {
      if (src[end] !== "{" && src[end] !== "[") break;
      const g = skipGroup(src, end, max);
      if (g < 0) break;
      end = g;
    }
    if (!silent) pushSourceInline(state, "tex", src.slice(pos, end));
  } else if (
    nextCh === " " ||
    (next > 0x7f && /[\p{P}\p{S}\p{Zs}]/u.test(nextCh))
  ) {
    end = pos + 1 + nextCh.length;
    if (!silent) pushSourceInline(state, "raw", src.slice(pos, end));
  } else return false;
  state.pos = end;
  return true;
}

/**
 * `~sub~` / `^sup^`: no unescaped whitespace inside, not part of `~~`.
 * Emits `pandoc_sub_open`/`pandoc_sup_open` around inline content.
 */
function scriptRule(marker: string, name: string) {
  return (state: MdState, silent: boolean): boolean => {
    const { src, pos } = state;
    const max = state.posMax;
    if (src[pos] !== marker) return false;
    if (src[pos + 1] === marker || src[pos - 1] === marker) return false;
    if (marker === "^" && src[pos + 1] === "[") return false;
    let i = pos + 1;
    for (; i < max; i++) {
      const ch = src[i];
      if (ch === "\\") {
        i++;
        continue;
      }
      if (/\s/.test(ch)) return false;
      if (ch === marker) break;
    }
    if (i >= max || i === pos + 1 || src[i + 1] === marker) return false;
    if (!silent) {
      state.push(`${name}_open`, name === "pandoc_sub" ? "sub" : "sup", 1);
      const oldMax = state.posMax;
      state.pos = pos + 1;
      state.posMax = i;
      state.md.inline.tokenize(state);
      state.posMax = oldMax;
      state.push(`${name}_close`, name === "pandoc_sub" ? "sub" : "sup", -1);
    }
    state.pos = i + 1;
    return true;
  };
}

// ---------------------------------------------------------------------------
// "no blank line before this block" tracking
// ---------------------------------------------------------------------------

const ATTACHABLE = new Set([
  "blockquote_open",
  "heading_open",
  "bullet_list_open",
  "ordered_list_open",
  "fence",
  "code_block",
  "hr",
  "source_block",
  "html_block",
  "pandoc_div_open",
]);

/**
 * Marks blocks that directly follow a paragraph with no blank line between
 * (CommonMark lets them interrupt the paragraph; Pandoc keeps the lines in
 * the paragraph). The serializer then also omits the blank line, so both
 * renderers keep seeing exactly the original structure.
 */
function markAttachedBlocks(state: MdState): void {
  // Per nesting level: end line of the previous sibling if it was a
  // paragraph, else null.
  const prevParaEnd: (number | null)[] = [];
  const paraEnd: (number | null)[] = [];
  for (const token of state.tokens) {
    const lvl: number = token.level;
    if (token.type === "paragraph_open") {
      paraEnd[lvl] = token.map ? token.map[1] : null;
      prevParaEnd[lvl] = null;
      continue;
    }
    if (token.type === "paragraph_close") {
      prevParaEnd[lvl] = paraEnd[lvl] ?? null;
      continue;
    }
    if (token.type === "inline") continue;
    if (
      ATTACHABLE.has(token.type) && token.map &&
      prevParaEnd[lvl] != null && prevParaEnd[lvl] === token.map[0]
    ) token.attrSet("data-md-attached", "1");
    // Any other block (its open, its close, or a leaf) ends the
    // "previous sibling is a paragraph" relation at this level.
    prevParaEnd[lvl] = null;
    if (token.nesting === 1) prevParaEnd[lvl + 1] = null;
  }
}

// ---------------------------------------------------------------------------
// registration
// ---------------------------------------------------------------------------

export function pandocVerbatimRules(md: any): void {
  const esc = md.utils.escapeHtml as (s: string) => string;

  // Raw HTML is preserved verbatim rather than escaped.
  md.set({ html: true });
  const r = md.renderer.rules as Record<string, any>;
  r.html_block = (tokens: any[], idx: number) => {
    const t = tokens[idx];
    const attached = t.attrGet("data-md-attached")
      ? ' data-md-attached="1"'
      : "";
    return `<pre data-source-block="html"${attached}>${
      esc(t.content.replace(/\n+$/, ""))
    }</pre>`;
  };
  const htmlInline = r.html_inline;
  r.html_inline = (tokens: any[], idx: number, ...rest: any[]) => {
    const content: string = tokens[idx].content;
    // Checkboxes injected by markdown-it-task-lists are real HTML.
    if (/^<input[^>]*task-list-item-checkbox/.test(content)) {
      return htmlInline ? htmlInline(tokens, idx, ...rest) : content;
    }
    return `<span data-source-inline="html" data-raw="${esc(content)}"></span>`;
  };

  // Block rules. None interrupt a paragraph (Pandoc needs a blank line
  // before all of these), except that a footnote definition may start
  // anywhere a block can.
  const b = md.block.ruler;
  b.before(
    "table",
    "pandoc_grid_table",
    verbatimRule("table", detectGridTable),
  );
  b.before(
    "table",
    "pandoc_multiline_table",
    verbatimRule("table", detectMultilineTable),
  );
  b.before(
    "table",
    "pandoc_simple_table",
    verbatimRule("table", detectSimpleTable),
  );
  b.before(
    "reference",
    "pandoc_footnote_def",
    verbatimRule("footnote", detectFootnoteDef),
  );
  b.before(
    "lheading",
    "pandoc_line_block",
    verbatimRule("lineblock", detectLineBlock),
  );
  b.before(
    "lheading",
    "pandoc_deflist",
    verbatimRule("deflist", detectDefList),
  );
  b.before(
    "lheading",
    "pandoc_colon_block",
    verbatimRule("caption", detectColonBlock),
  );
  b.before(
    "lheading",
    "pandoc_fancy_list",
    verbatimRule("list", detectFancyList),
  );
  b.before("lheading", "pandoc_tex_env", verbatimRule("tex", detectTexEnv));

  // Inline rules.
  const i = md.inline.ruler;
  i.before("escape", "pandoc_backslash", backslashRule);
  i.before("link", "pandoc_footnote_ref", footnoteRefRule);
  i.before("link", "pandoc_citation", bracketCitationRule);
  i.before("text", "pandoc_bare_citation", bareCitationRule);
  i.before("strikethrough", "pandoc_sub", scriptRule("~", "pandoc_sub"));
  i.before("strikethrough", "pandoc_inline_note", inlineNoteRule);
  i.before("strikethrough", "pandoc_sup", scriptRule("^", "pandoc_sup"));
  r.pandoc_sub_open = () => "<sub>";
  r.pandoc_sub_close = () => "</sub>";
  r.pandoc_sup_open = () => "<sup>";
  r.pandoc_sup_close = () => "</sup>";

  md.core.ruler.push("pandoc_attached_blocks", markAttachedBlocks);
}
