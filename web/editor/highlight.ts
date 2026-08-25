import { common, createLowlight } from "lowlight";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { parseCodeLangSpec } from "./langSpec.ts";

/**
 * Syntax highlighting for fenced code blocks.
 *
 * highlight.js (via lowlight, `common` bundle ≈ 40 languages) tokenises each
 * code block; the tokens are turned into ProseMirror inline decorations so
 * they render inside the editable contentDOM without touching the document
 * model (the same approach as @tiptap/extension-code-block-lowlight).
 *
 * The block's `language` attribute may carry options (see langSpec.ts):
 * `ts{1,3-5}` highlights the base language `ts` and marks lines 1 and 3–5
 * with the `hl-line` decoration class.
 */
const lowlight = createLowlight(common);

interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: string[] | string };
  children?: HastNode[];
}

interface Token {
  text: string;
  classes: string[];
}

/** Flatten a hast tree into text tokens with accumulated class lists. */
function flattenTokens(nodes: HastNode[], classes: string[], out: Token[]) {
  for (const node of nodes) {
    if (node.type === "element") {
      const props = node.properties?.className;
      const extra = Array.isArray(props)
        ? props
        : typeof props === "string"
        ? [props]
        : [];
      flattenTokens(node.children ?? [], [...classes, ...extra], out);
    } else if (typeof node.value === "string") {
      if (node.value.length) out.push({ text: node.value, classes });
    }
  }
}

/** Decorate the 1-based `wanted` lines of `text` starting at doc pos `from`. */
function lineHighlightDecorations(
  decorations: Decoration[],
  text: string,
  from: number,
  wanted: Set<number>,
): void {
  let offset = from;
  for (const [idx, line] of text.split("\n").entries()) {
    const lineNo = idx + 1;
    if (line.length && wanted.has(lineNo)) {
      decorations.push(
        Decoration.inline(offset, offset + line.length, { class: "hl-line" }),
      );
    }
    offset += line.length + 1; // + newline
  }
}

/**
 * Compute highlight decorations for every code-block node in `doc`.
 * Returns an empty set (not null) so callers can always `.map()` it.
 */
export function highlightDecorations(
  doc: ProseMirrorNode,
  blockTypeName: string,
): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== blockTypeName) return true;
    const spec = parseCodeLangSpec(node.attrs.language as string | null);
    const text = node.textContent ?? "";
    const contentStart = pos + 1; // first position inside the block's content

    if (spec.lang && lowlight.registered(spec.lang)) {
      let tree: HastNode;
      try {
        tree = lowlight.highlight(spec.lang, text) as unknown as HastNode;
      } catch {
        tree = { type: "root", children: [] };
      }

      const tokens: Token[] = [];
      flattenTokens(tree.children ?? [], [], tokens);

      let from = contentStart;
      for (const token of tokens) {
        const to = from + token.text.length;
        if (token.classes.length) {
          decorations.push(
            Decoration.inline(from, to, { class: token.classes.join(" ") }),
          );
        }
        from = to;
      }
    }

    if (spec.highlightLines.length) {
      lineHighlightDecorations(
        decorations,
        text,
        contentStart,
        new Set(spec.highlightLines),
      );
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}
