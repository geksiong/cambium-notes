/**
 * Source-preserving support for Pandoc-markdown syntax that CommonMark
 * (markdown-it) does not know about, so documents written for Pandoc-based
 * toolchains (e.g. libromorph) survive a load → save cycle unchanged.
 *
 * Without this, the markdown serializer treats such syntax as plain text and
 * escapes it: `[term]{.index}` → `\[term\]{.index}`, `$\hat{H}$` →
 * `$\\hat{H}$`, `::: note` blocks collapse into one paragraph, and
 * `[[wikilinks]]` become `\[\[wikilinks\]\]` (breaking the link graph).
 *
 * Covered here:
 * - TeX math `$…$` / `$$…$$` (Pandoc `tex_math_dollars` rules) and
 *   `[[wikilinks]]` → `sourceInline` atom nodes holding the source verbatim
 *   (attributes keep newlines/backslashes exactly). The node view shows the
 *   source as a small editable field.
 * - Bracketed spans `[text]{#id .class key="val"}` → `pandocSpan` mark that
 *   keeps the attribute string verbatim; the text stays normal rich text.
 *   Empty spans (`[]{#anchor}`) can't be marks, so they become
 *   `sourceInline` atoms of kind "raw".
 * - Fenced divs `::: note` … `:::` (nestable, any colon count) →
 *   `pandocDiv` block node keeping its opening/closing fence lines verbatim.
 *
 * - Pandoc constructs with no structured node (definition lists, line
 *   blocks, fancy lists, grid/simple/multiline tables, footnotes, citations,
 *   raw TeX/HTML, …) are kept verbatim by the rules in pandocVerbatim.ts.
 * - Blocks written directly under a paragraph (no blank line) are flagged
 *   `mdAttached` and written back the same way, since CommonMark and Pandoc
 *   read that layout differently.
 * - PandocText escapes text characters Pandoc would otherwise read as
 *   syntax (`$`, `^`, citation `@`, block-start markers).
 *
 * Guarantee (tests/pandocMarkdown.test.ts): saving never changes how either
 * Pandoc or CommonMark renders the file. Rendering in the editor (KaTeX,
 * callout styling, ruby, …) is layered on later.
 */
import { Extension, Mark, mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { pandocVerbatimRules } from "./pandocVerbatim.ts";
import { parseFenceAttributes } from "./attributes.ts";

// ---------------------------------------------------------------------------
// Pandoc attribute syntax
// ---------------------------------------------------------------------------

const ID_CHARS = String.raw`[\p{L}\p{N}_:.\-]+`;
const ATTR_TOKEN = String.raw`(?:#${ID_CHARS}|\.${ID_CHARS}|${ID_CHARS}=` +
  String.raw`(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s"'{}]+))`;
/** A Pandoc attribute list body (between the braces); may be empty. */
const ATTR_LIST_RE = new RegExp(
  String.raw`^\s*(?:${ATTR_TOKEN}(?:\s+${ATTR_TOKEN})*)?\s*$`,
  "u",
);

export function isPandocAttrList(body: string): boolean {
  return ATTR_LIST_RE.test(body);
}

// ---------------------------------------------------------------------------
// markdown-it rules
// ---------------------------------------------------------------------------

type MdState = any;

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;
const LBRACKET = 0x5b;
const LBRACE = 0x7b;

const isWs = (c: number) =>
  c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || Number.isNaN(c);
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;

function pushSource(state: MdState, kind: string, raw: string): void {
  const token = state.push("source_inline", "", 0);
  token.meta = { kind, raw };
}

/**
 * `$…$` and `$$…$$`, following Pandoc's tex_math_dollars rules: the opening
 * `$` must be followed by non-space, the closing `$` preceded by non-space
 * and not followed by a digit (so "$20 and $30" stays text). Display math is
 * inline in Pandoc too (it lives inside a paragraph).
 */
function mathRule(state: MdState, silent: boolean): boolean {
  const src: string = state.src;
  const start: number = state.pos;
  const max: number = state.posMax;
  if (src.charCodeAt(start) !== DOLLAR) return false;

  let end = -1;
  if (src.charCodeAt(start + 1) === DOLLAR) {
    let i = start + 2;
    while (i < max - 1) {
      const c = src.charCodeAt(i);
      if (c === BACKSLASH) {
        i += 2;
        continue;
      }
      if (c === DOLLAR && src.charCodeAt(i + 1) === DOLLAR) break;
      i++;
    }
    if (i >= max - 1 || i === start + 2) return false;
    end = i + 2;
  } else {
    if (isWs(src.charCodeAt(start + 1))) return false;
    let i = start + 1;
    while (i < max) {
      const c = src.charCodeAt(i);
      if (c === BACKSLASH) {
        i += 2;
        continue;
      }
      if (
        c === DOLLAR && !isWs(src.charCodeAt(i - 1)) &&
        !isDigit(src.charCodeAt(i + 1))
      ) break;
      i++;
    }
    if (i >= max) return false;
    end = i + 1;
  }

  if (!silent) pushSource(state, "math", src.slice(start, end));
  state.pos = end;
  return true;
}

/** `[[target]]` / `[[target|label]]` — kept verbatim for the link graph. */
function wikilinkRule(state: MdState, silent: boolean): boolean {
  const src: string = state.src;
  const start: number = state.pos;
  if (
    src.charCodeAt(start) !== LBRACKET ||
    src.charCodeAt(start + 1) !== LBRACKET
  ) return false;
  const m = /^\[\[[^[\]\n]+\]\]/.exec(src.slice(start, state.posMax));
  if (!m) return false;
  if (!silent) pushSource(state, "wikilink", m[0]);
  state.pos = start + m[0].length;
  return true;
}

/** Index of the `}` closing an attribute list opened at `open`, or -1. */
function findAttrEnd(src: string, open: number, max: number): number {
  let quote = 0;
  for (let i = open + 1; i < max; i++) {
    const c = src.charCodeAt(i);
    if (quote) {
      if (c === BACKSLASH) i++;
      else if (c === quote) quote = 0;
    } else if (c === 0x22 || c === 0x27) quote = c;
    else if (c === 0x7d) return i;
    else if (c === LBRACE) return -1;
  }
  return -1;
}

/** `[inline content]{attributes}` — Pandoc bracketed span. */
function spanRule(state: MdState, silent: boolean): boolean {
  const src: string = state.src;
  const start: number = state.pos;
  const max: number = state.posMax;
  if (src.charCodeAt(start) !== LBRACKET) return false;

  const labelEnd: number = state.md.helpers.parseLinkLabel(state, start, false);
  if (labelEnd < 0 || src.charCodeAt(labelEnd + 1) !== LBRACE) return false;
  const attrEnd = findAttrEnd(src, labelEnd + 1, max);
  if (attrEnd < 0) return false;
  const attrs = src.slice(labelEnd + 2, attrEnd);
  if (!isPandocAttrList(attrs)) return false;
  const end = attrEnd + 1;

  if (!silent) {
    if (labelEnd === start + 1) {
      // Empty span (an anchor): no text to carry a mark.
      pushSource(state, "raw", src.slice(start, end));
    } else {
      const open = state.push("pandoc_span_open", "span", 1);
      open.meta = { attrs };
      state.pos = start + 1;
      state.posMax = labelEnd;
      state.md.inline.tokenize(state);
      state.push("pandoc_span_close", "span", -1);
      state.posMax = max;
    }
  }
  state.pos = end;
  return true;
}

function lineText(state: MdState, line: number): string {
  return state.src.slice(
    state.bMarks[line] + state.tShift[line],
    state.eMarks[line],
  );
}

/** `:::` + a single word or `{attrs}`, optionally followed by more colons. */
const DIV_OPEN_RE = /^(:{3,})\s*([^\s:{][^\s:]*|\{[^}]*\})\s*(?::+\s*)?$/u;
const DIV_CLOSE_RE = /^:{3,}\s*$/;
const FENCE_RE = /^(`{3,}|~{3,})/;

function isDivOpen(text: string): boolean {
  const m = DIV_OPEN_RE.exec(text);
  if (!m) return false;
  const attrs = m[2];
  return attrs.startsWith("{")
    ? isPandocAttrList(attrs.slice(1, -1))
    : /^[\p{L}\p{N}_\-]+$/u.test(attrs);
}

/**
 * Pandoc fenced div. Like Pandoc, it does not interrupt a paragraph and must
 * be closed; nested divs and `:::` lines inside code fences are respected.
 */
function divRule(
  state: MdState,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const openText = lineText(state, startLine).trimEnd();
  if (!isDivOpen(openText)) return false;

  let depth = 1;
  let fence: string | null = null;
  let line = startLine + 1;
  for (; line < endLine; line++) {
    const text = lineText(state, line);
    if (text.length && state.sCount[line] < state.blkIndent) return false;
    if (fence) {
      if (
        text.startsWith(fence[0].repeat(fence.length)) &&
        new RegExp(`^\\${fence[0]}+\\s*$`).test(text)
      ) fence = null;
      continue;
    }
    const fm = FENCE_RE.exec(text);
    if (fm) {
      fence = fm[1];
      continue;
    }
    if (DIV_CLOSE_RE.test(text)) {
      if (--depth === 0) break;
    } else if (isDivOpen(text.trimEnd())) depth++;
  }
  if (line >= endLine) return false;
  if (silent) return true;

  const oldParent = state.parentType;
  const oldLineMax = state.lineMax;
  state.parentType = "pandoc_div";
  state.lineMax = line;

  const open = state.push("pandoc_div_open", "div", 1);
  open.block = true;
  open.map = [startLine, line + 1];
  open.meta = { open: openText, close: lineText(state, line).trimEnd() };
  state.md.block.tokenize(state, startLine + 1, line);
  const close = state.push("pandoc_div_close", "div", -1);
  close.block = true;

  state.parentType = oldParent;
  state.lineMax = oldLineMax;
  state.line = line + 1;
  return true;
}

/**
 * Wrap a block rule so whatever it matches becomes one `source_block` token
 * carrying the matched lines verbatim (used for tables, which the editor
 * has no structured node for).
 */
function verbatimBlock(md: any, ruleName: string, kind: string): void {
  const rule = md.block.ruler.__rules__.find((r: any) => r.name === ruleName);
  if (!rule) return;
  const orig = rule.fn;
  md.block.ruler.at(
    ruleName,
    (state: MdState, startLine: number, endLine: number, silent: boolean) => {
      if (silent) return orig(state, startLine, endLine, true);
      const len = state.tokens.length;
      if (!orig(state, startLine, endLine, false)) return false;
      const lines: string[] = [];
      for (let l = startLine; l < state.line; l++) {
        lines.push(lineText(state, l).trimEnd());
      }
      state.tokens.length = len;
      const token = state.push("source_block", "pre", 0);
      token.block = true;
      token.map = [startLine, state.line];
      token.meta = { kind, raw: lines.join("\n") };
      return true;
    },
    { alt: rule.alt },
  );
}

export function pandocMarkdownIt(md: any): void {
  if (md._pandocSyntaxApplied) return;
  md._pandocSyntaxApplied = true;
  const esc = md.utils.escapeHtml as (s: string) => string;

  md.inline.ruler.before("escape", "pandoc_math", mathRule);
  md.inline.ruler.before("link", "wikilink", wikilinkRule);
  md.inline.ruler.before("link", "pandoc_span", spanRule);
  // No `alt`: like Pandoc, a fenced div never interrupts a paragraph.
  md.block.ruler.before("fence", "pandoc_div", divRule);
  verbatimBlock(md, "table", "table");
  pandocVerbatimRules(md);
  md.core.ruler.after("linkify", "pandoc_bare_links", markBareLinks);

  const r = md.renderer.rules as Record<string, any>;
  r.source_inline = (tokens: any[], idx: number) => {
    const { kind, raw } = tokens[idx].meta;
    return `<span data-source-inline="${esc(kind)}" data-raw="${
      esc(raw)
    }"></span>`;
  };
  r.pandoc_span_open = (tokens: any[], idx: number) =>
    `<span data-pandoc-attrs="${esc(tokens[idx].meta.attrs)}">`;
  r.pandoc_span_close = () => "</span>";
  const attached = (token: any) =>
    token.attrGet("data-md-attached") ? ' data-md-attached="1"' : "";
  r.pandoc_div_open = (tokens: any[], idx: number) => {
    const { open, close } = tokens[idx].meta;
    return `<div data-pandoc-div="${esc(open)}" data-close="${esc(close)}"${
      attached(tokens[idx])
    }>`;
  };
  r.pandoc_div_close = () => "</div>";
  r.source_block = (tokens: any[], idx: number) => {
    const { kind, raw } = tokens[idx].meta;
    return `<pre data-source-block="${esc(kind)}"${attached(tokens[idx])}>${
      esc(raw)
    }</pre>`;
  };
}

/**
 * Flags links that markdown-it's linkify created from bare text (Pandoc
 * leaves bare URLs as plain text), recording the original text so the
 * serializer can write it back unlinked while it is unchanged.
 */
function markBareLinks(state: MdState): void {
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children) continue;
    const kids = block.children;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].type === "link_open" && kids[i].markup === "linkify") {
        kids[i].attrSet("data-bare", kids[i + 1]?.content ?? "");
      }
    }
  }
}

/** Block types that may sit directly under a paragraph without a blank. */
const ATTACHABLE_NODES = [
  "blockquote",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "codeBlock",
  "horizontalRule",
  "sourceBlock",
  "pandocDiv",
];

/**
 * Wraps tiptap-markdown's node serializers so a block flagged
 * `mdAttached` (no blank line in the source between it and the paragraph
 * above) is written the same way — keeping CommonMark's and Pandoc's
 * readings of the file unchanged.
 */
function patchAttachedSerialization(editor: any): void {
  const serializer = editor.storage.markdown?.serializer;
  if (!serializer || serializer._attachedPatched) return;
  serializer._attachedPatched = true;
  const proto = Object.getPrototypeOf(serializer);
  const getNodes = Object.getOwnPropertyDescriptor(proto, "nodes")?.get;
  if (!getNodes) return;
  Object.defineProperty(serializer, "nodes", {
    get() {
      const nodes = getNodes.call(this) as Record<string, any>;
      for (const [name, fn] of Object.entries(nodes)) {
        if (typeof fn !== "function" || !ATTACHABLE_NODES.includes(name)) {
          continue;
        }
        nodes[name] = (state: any, node: any, parent: any, index: number) => {
          if (
            node.attrs.mdAttached && index > 0 &&
            parent.child(index - 1).type.name === "paragraph" && state.closed
          ) state.flushClose(1);
          return fn(state, node, parent, index);
        };
      }
      return nodes;
    },
  });
}

// ---------------------------------------------------------------------------
// TipTap schema
// ---------------------------------------------------------------------------

/** Registers the markdown-it rules with tiptap-markdown's parser. */
export const PandocSyntax = Extension.create({
  name: "pandocSyntax",
  // Below tiptap-markdown (50) so its serializer exists in onBeforeCreate.
  priority: 40,
  addStorage() {
    return { markdown: { parse: { setup: pandocMarkdownIt } } };
  },
  addGlobalAttributes() {
    return [{
      types: ATTACHABLE_NODES,
      attributes: {
        mdAttached: {
          default: false,
          keepOnSplit: false,
          parseHTML: (el: HTMLElement) =>
            el.getAttribute("data-md-attached") === "1" ||
            el.querySelector(":scope > code")?.getAttribute(
                "data-md-attached",
              ) === "1",
          renderHTML: (a: Record<string, unknown>) =>
            a.mdAttached ? { "data-md-attached": "1" } : {},
        },
      },
    }];
  },
  onBeforeCreate() {
    patchAttachedSerialization(this.editor);
  },
  addProseMirrorPlugins() {
    return [lastKeyPlugin];
  },
});

/**
 * Remembers the last navigation key pressed in the editor, so a source
 * field entered by arrowing can place its caret on the side the user came
 * from.
 */
let lastNavKey = "";
const lastKeyPlugin = new Plugin({
  key: new PluginKey("sourceInlineLastKey"),
  props: {
    handleKeyDown(_view, event) {
      lastNavKey = event.key;
      return false;
    },
    handleClick() {
      lastNavKey = "";
      return false;
    },
  },
});

/**
 * Inline atom carrying verbatim markdown source (math, wikilinks, empty
 * spans). Serialized exactly as stored; shown as an editable source field.
 */
export const SourceInline = Node.create({
  name: "sourceInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: "raw",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-source-inline") || "raw",
        renderHTML: (a: Record<string, unknown>) => ({
          "data-source-inline": a.kind,
        }),
      },
      raw: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-raw") ?? "",
        renderHTML: (a: Record<string, unknown>) => ({ "data-raw": a.raw }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-source-inline]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: `src-inline src-inline--${node.attrs.kind}`,
      }),
      node.attrs.raw as string,
    ];
  },

  renderText({ node }) {
    return node.attrs.raw as string;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.text(node.attrs.raw as string, false);
        },
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }: any) => {
      let current: any = node;
      const dom = document.createElement("span");
      dom.contentEditable = "false";
      const field = document.createElement("span");
      field.className = "src-inline-field";
      field.contentEditable = "true";
      field.spellcheck = false;
      field.textContent = current.attrs.raw;
      dom.appendChild(field);
      const syncClass = () => {
        dom.className = `src-inline src-inline--${current.attrs.kind}`;
        dom.title = current.attrs.kind === "math"
          ? "TeX math (source)"
          : current.attrs.kind === "wikilink"
          ? "Wikilink"
          : "Pandoc markup";
      };
      syncClass();

      const pos = (): number | undefined =>
        typeof getPos === "function" ? getPos() : undefined;

      const commit = () => {
        const p = pos();
        if (typeof p !== "number") return;
        const text = field.textContent ?? "";
        if (text === current.attrs.raw) return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(p, undefined, {
            ...current.attrs,
            raw: text,
          }),
        );
      };

      const leave = (dir: 1 | -1) => {
        commit();
        const p = pos();
        if (typeof p !== "number") return;
        const { doc } = editor.state;
        // An emptied field removes the node.
        if ((field.textContent ?? "") === "") {
          editor.view.dispatch(
            editor.state.tr.delete(p, p + current.nodeSize),
          );
        } else {
          const target = dir === 1 ? p + current.nodeSize : p;
          editor.view.dispatch(
            editor.state.tr.setSelection(
              Selection.near(doc.resolve(target), dir),
            ),
          );
        }
        editor.view.focus();
      };

      field.addEventListener("input", commit);
      field.addEventListener("blur", () => {
        commit();
        if ((field.textContent ?? "") === "") {
          const p = pos();
          if (typeof p === "number") {
            editor.view.dispatch(
              editor.state.tr.delete(p, p + current.nodeSize),
            );
          }
        }
      });
      field.addEventListener("keydown", (e) => {
        const sel = globalThis.getSelection?.();
        const len = (field.textContent ?? "").length;
        const collapsed = !sel || sel.isCollapsed;
        const off = sel?.focusOffset ?? 0;
        if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          leave(1);
        } else if (e.key === "Enter") {
          // Shift+Enter: literal newline (multi-line display math).
          e.preventDefault();
          document.execCommand("insertText", false, "\n");
        } else if (
          (e.key === "ArrowRight" && collapsed && off >= len) ||
          (e.key === "ArrowDown" && collapsed && off >= len)
        ) {
          e.preventDefault();
          leave(1);
        } else if (
          (e.key === "ArrowLeft" || e.key === "ArrowUp") && collapsed &&
          off === 0
        ) {
          e.preventDefault();
          leave(-1);
        }
      });

      return {
        dom,
        update(updated: any) {
          if (updated.type !== current.type) return false;
          current = updated;
          if (
            document.activeElement !== field &&
            field.textContent !== current.attrs.raw
          ) field.textContent = current.attrs.raw;
          syncClass();
          return true;
        },
        selectNode() {
          dom.classList.add("is-selected");
          // Arrowed onto the node: continue into its source.
          const fromRight = lastNavKey === "ArrowLeft" ||
            lastNavKey === "ArrowUp";
          if (!lastNavKey.startsWith("Arrow")) return;
          setTimeout(() => {
            field.focus();
            const range = document.createRange();
            range.selectNodeContents(field);
            range.collapse(!fromRight);
            const s = globalThis.getSelection?.();
            s?.removeAllRanges();
            s?.addRange(range);
          }, 0);
        },
        deselectNode() {
          dom.classList.remove("is-selected");
        },
        stopEvent(event: Event) {
          return event.target instanceof globalThis.Node &&
            field.contains(event.target);
        },
        ignoreMutation() {
          return true;
        },
      };
    };
  },
});

/** Pandoc bracketed span; the attribute string is preserved verbatim. */
export const PandocSpan = Mark.create({
  name: "pandocSpan",
  // Rank before bold/italic/code/link so a span always nests outermost:
  // `[a **b** c]{.x}` must not serialize as three separate spans.
  priority: 1100,
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      attrs: {
        default: "",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-pandoc-attrs") ?? "",
        renderHTML: (a: Record<string, unknown>) => ({
          "data-pandoc-attrs": a.attrs,
          title: `{${a.attrs}}`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-pandoc-attrs]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "pandoc-span" }),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize: {
          open: "[",
          close: (_state: any, mark: any) => `]{${mark.attrs.attrs}}`,
        },
      },
    };
  },
});

/**
 * Escape `$` in plain text where it could open TeX math on reload — i.e.
 * when followed by a non-space, non-digit character or by the end of the
 * text node (the next node may continue it). Pandoc requires a non-space
 * after the opening `$`, so "$20" stays readable. Applied to text
 * that prosemirror-markdown has already escaped, so it never doubles up.
 */
export function escapeDollars(text: string): string {
  return escapeInline(text);
}

/**
 * Pandoc-specific inline escaping on top of prosemirror-markdown's: `$`
 * (math, see above), every `^` (superscript / inline note) and `@` that
 * could start a citation (preceded by a non-word character or the node
 * start, followed by a key character — e-mail addresses are left alone).
 */
function escapeInline(text: string): string {
  let out = "";
  let backslashes = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (backslashes % 2 === 0) {
      const next = text[i + 1];
      if (ch === "$") {
        if (next === undefined || !/[\s\d]/.test(next)) out += "\\";
      } else if (ch === "^") out += "\\";
      else if (
        ch === "@" && (i === 0 || !/[\p{L}\p{N}_]/u.test(text[i - 1])) &&
        next !== undefined && /[\p{L}\p{N}_]/u.test(next)
      ) out += "\\";
    }
    backslashes = ch === "\\" ? backslashes + 1 : 0;
    out += ch;
  }
  return out;
}

/**
 * Escapes for text at the start of a block that Pandoc would otherwise read
 * as a block marker: line blocks `|`, definitions `: `, grid table borders
 * `+-`, and its extra list markers (`a.`, `i)`, `#.`, `(@)`, `(1)`…).
 * prosemirror-markdown already covers `#`, `-`, `+ `, `*`, `>`, `1.`.
 */
function escapeBlockStart(text: string): string {
  return text
    .replace(/^(\s*)([|:])(?=\s|$)/, "$1\\$2")
    .replace(/^(\s*)\+(?=[-=:])/, "$1\\+")
    .replace(
      /^(\s*)(\((?:[a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+|\d+|#|@[\w-]*)\))(?=\s|$)/,
      "$1\\$2",
    )
    .replace(
      /^(\s*)([a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+|@[\w-]*)([.)])(?=\s|$)/,
      "$1$2\\$3",
    )
    .replace(/^(\s*)#([.)])(?=\s|$)/, "$1\\#$2");
}

/** Escapes `<`/`>` like tiptap-markdown's own text serializer. */
const escapeHTML = (v: string) => v.replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Replacement for StarterKit's text node (configure StarterKit with
 * `text: false`): identical schema, but its markdown serializer also
 * escapes Pandoc syntax characters (see escapeInline / escapeBlockStart) so
 * literal text never reloads as math, citations, notes or block markers.
 */
export const PandocText = Node.create({
  name: "text",
  group: "inline",

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const esc = state.esc;
          state.esc = (str: string, startOfLine?: boolean) => {
            const escaped = escapeInline(esc.call(state, str, startOfLine));
            return startOfLine ? escapeBlockStart(escaped) : escaped;
          };
          try {
            state.text(escapeHTML(node.text as string));
          } finally {
            state.esc = esc;
          }
        },
      },
    };
  },
});

/** Pandoc `~subscript~`. */
export const PandocSub = Mark.create({
  name: "subscript",
  excludes: "superscript",
  parseHTML() {
    return [{ tag: "sub" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sub", HTMLAttributes, 0];
  },
  addStorage() {
    return { markdown: { serialize: { open: "~", close: "~" } } };
  },
});

/** Pandoc `^superscript^`. */
export const PandocSup = Mark.create({
  name: "superscript",
  excludes: "subscript",
  parseHTML() {
    return [{ tag: "sup" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sup", HTMLAttributes, 0];
  },
  addStorage() {
    return { markdown: { serialize: { open: "^", close: "^" } } };
  },
});

/** Display label for a div's opening fence: `::: {.quiz}` → `{.quiz}`. */
export function divLabel(open: string): string {
  return open.replace(/^:+\s*/, "").replace(/\s*:+\s*$/, "");
}

/**
 * Divs libromorph draws as collapsible reveals (`<details>`), with their
 * default labels. `title=` overrides the label.
 */
const REVEAL_KINDS: Record<string, string> = {
  hint: "Hint",
  solution: "Solution",
};

/**
 * How the editor labels a div: `::: hint` → "Hint" (kind "hint"),
 * `::: {.solution title="Walkthrough"}` → "Walkthrough" (kind "solution"),
 * anything else → its attribute list (`{.quiz}`) and no kind. The editor
 * never collapses a reveal, so its content stays editable.
 */
export function divDisplay(
  open: string,
): { label: string; kind: string | null } {
  const label = divLabel(open);
  const { classes, attrs } = parseFenceAttributes(label);
  const kind = classes.find((c) => c in REVEAL_KINDS);
  if (!kind) return { label, kind: null };
  return { label: attrs.title || REVEAL_KINDS[kind], kind };
}

function divClassAndLabel(open: string) {
  const { label, kind } = divDisplay(open);
  return {
    class: kind
      ? `pandoc-div pandoc-reveal pandoc-reveal-${kind}`
      : "pandoc-div",
    "data-label": label,
  };
}

/** Pandoc fenced div; the fence lines are preserved verbatim. */
export const PandocDiv = Node.create({
  name: "pandocDiv",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      open: {
        default: "::: note",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-pandoc-div") ?? "::: note",
        renderHTML: (a: Record<string, unknown>) => ({
          "data-pandoc-div": a.open,
        }),
      },
      close: {
        default: ":::",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-close") ?? ":::",
        renderHTML: (a: Record<string, unknown>) => ({ "data-close": a.close }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-pandoc-div]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, divClassAndLabel(node.attrs.open)),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(node.attrs.open);
          state.ensureNewLine();
          state.renderContent(node);
          state.flushClose(1);
          state.write(node.attrs.close);
          state.closeBlock(node);
        },
      },
    };
  },
});

/**
 * Block of markdown kept verbatim and edited as plain text (tables for now).
 */
export const SourceBlock = Node.create({
  name: "sourceBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "raw",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-source-block") || "raw",
        renderHTML: (a: Record<string, unknown>) => ({
          "data-source-block": a.kind,
        }),
      },
    };
  },

  parseHTML() {
    // Outrank the code block's generic `pre` rule.
    return [{
      tag: "pre[data-source-block]",
      preserveWhitespace: "full",
      priority: 100,
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, {
        class: `src-block src-block--${node.attrs.kind}`,
        spellcheck: "false",
      }),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.text(node.textContent, false);
          state.closeBlock(node);
        },
      },
    };
  },
});

/**
 * Everything needed for Pandoc round-trip safety. Requires StarterKit to be
 * configured with `text: false` (PandocText replaces its text node).
 */
export const PANDOC_EXTENSIONS = [
  PandocText,
  PandocSyntax,
  SourceInline,
  PandocSpan,
  PandocDiv,
  SourceBlock,
  PandocSub,
  PandocSup,
];
