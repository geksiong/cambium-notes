import CodeBlock from "@tiptap/extension-code-block";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";

/** Parse `![alt](url "title")` — returns null if text doesn't match. */
function parseImageMd(
  text: string,
): { src: string; alt: string; title: string } | null {
  const m = text.trim().match(
    /^!\[([^\]]*)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)((?:\s+"[^"]*")?)\)$/,
  );
  if (!m) return null;
  return {
    alt: m[1],
    src: m[2],
    title: m[3] ? m[3].trim().slice(1, -1) : "",
  };
}

const imageSizeCache = new Map<string, Promise<number | null>>();

/**
 * Fetch the actual byte size of an image by downloading its body and
 * measuring it. The backend streams files without a Content-Length header,
 * so HEAD/Content-Length is unreliable. The result is cached per-URL.
 */
export function fetchImageSize(src: string): Promise<number | null> {
  if (!src) return Promise.resolve(null);
  const cached = imageSizeCache.get(src);
  if (cached) return cached;
  const p = fetch(src)
    .then((r) => r.blob())
    .then((blob) => blob.size)
    .catch(() => null);
  imageSizeCache.set(src, p);
  return p;
}

/**
 * Image node with hover-zoom button and inline markdown editing.
 *
 * Click or arrow-navigate onto the image → shows the raw markdown source
 * (`![alt](src "title")`) as an editable inline text span. Moving the
 * cursor away commits the edits and re-renders the image.
 */
const EditableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdown: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs(element: HTMLElement) {
          const mdSrc = element.getAttribute("data-md-src");
          return {
            src: element.getAttribute("src"),
            alt: element.getAttribute("alt"),
            title: element.getAttribute("title"),
            markdown: mdSrc || null,
          };
        },
      },
    ];
  },

  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          const md = node.attrs.markdown as string | null;
          if (md) {
            state.write(md);
          } else {
            const src = (node.attrs.src as string) || "";
            const alt = (node.attrs.alt as string) || "";
            const title = (node.attrs.title as string) || "";
            state.write(
              title
                ? `![${state.esc(alt)}](${src} "${title}")`
                : `![${state.esc(alt)}](${src})`,
            );
          }
        },
      },
    };
  },

  addNodeView() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({ node, editor, getPos }: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let current: any = node;
      const currentInfo = () => {
        const md = (current.attrs.markdown as string | null) ?? (() => {
          const src = (current.attrs.src as string) || "";
          const alt = (current.attrs.alt as string) || "";
          const title = (current.attrs.title as string) || "";
          return title
            ? `![${alt}](${src} "${title}")`
            : `![${alt}](${src})`;
        })();
        const parsed = parseImageMd(md);
        return {
          link: parsed?.src ?? (current.attrs.src as string) ?? "",
          alt: parsed?.alt ?? (current.attrs.alt as string) ?? "",
        };
      };
      let editing = false;
      let ready = false;
      setTimeout(() => { ready = true; }, 0);

      const wrap = document.createElement("span");
      wrap.className = "img-wrap";

      const img = document.createElement("img");
      img.src = current.attrs.src as string;
      img.alt = (current.attrs.alt as string) ?? "";
      img.title = (current.attrs.title as string) ?? "";
      wrap.appendChild(img);

      const btn = document.createElement("button");
      btn.className = "img-zoom-btn";
      btn.textContent = "\u2922";
      btn.title = "Zoom image";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent("cambium:image-zoom", {
            detail: {
              src: current.attrs.src as string,
              alt: (current.attrs.alt as string) ?? "",
              link: currentInfo().link,
            },
          }),
        );
      });
      wrap.appendChild(btn);

      const editableSpan = document.createElement("span");
      editableSpan.className = "img-edit-inline";
      editableSpan.contentEditable = "true";
      editableSpan.spellcheck = false;
      editableSpan.style.display = "none";
      wrap.appendChild(editableSpan);

      // -- hover info overlay: dimensions, filesize, alt, link --
      const overlay = document.createElement("div");
      overlay.className = "img-info-overlay";

      const addLine = (label: string) => {
        const line = document.createElement("div");
        line.className = "img-info-line";
        const lb = document.createElement("span");
        lb.className = "img-info-label";
        lb.textContent = label;
        const val = document.createElement("span");
        val.className = "img-info-value";
        line.appendChild(lb);
        line.appendChild(val);
        overlay.appendChild(line);
        return val;
      };

      const dimVal = addLine("Dimensions");
      const sizeVal = addLine("Size");
      const altVal = addLine("Alt");
      const linkVal = addLine("Link");

      wrap.appendChild(overlay);

      const formatBytes = (b: number) => {
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / (1024 * 1024)).toFixed(2)} MB`;
      };

      const refreshOverlay = () => {
        const { link, alt } = currentInfo();
        altVal.textContent = alt || "—";
        linkVal.textContent = link || "—";
        linkVal.title = link;
      };

      img.addEventListener("load", () => {
        if (img.naturalWidth && img.naturalHeight) {
          dimVal.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
        } else {
          dimVal.textContent = "—";
        }
        const src = (current.attrs.src as string) || "";
        if (src) {
          fetchImageSize(src).then((size) => {
            if (size) sizeVal.textContent = formatBytes(size);
          });
        }
      });

      refreshOverlay();

      const markdownText = () =>
        (current.attrs.markdown as string | null) ?? imageToMarkdown();

      const imageToMarkdown = () => {
        const src = (current.attrs.src as string) || "";
        const alt = (current.attrs.alt as string) || "";
        const title = (current.attrs.title as string) || "";
        return title
          ? `![${alt}](${src} "${title}")`
          : `![${alt}](${src})`;
      };

      const startEditing = () => {
        if (editing) return;
        editing = true;
        editableSpan.textContent = markdownText();
        img.style.display = "none";
        btn.style.display = "none";
        editableSpan.style.display = "";
        wrap.classList.add("img-editing");
        setTimeout(() => {
          if (!editing) return;
          editableSpan.focus();
          const range = document.createRange();
          range.selectNodeContents(editableSpan);
          range.collapse(false);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }, 0);
      };

      const commitNode = (): boolean => {
        if (!editing) return false;
        editing = false;
        editableSpan.style.display = "none";
        img.style.display = "";
        btn.style.display = "";
        wrap.classList.remove("img-editing");

        const text = editableSpan.textContent || "";
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return false;

        const parsed = parseImageMd(text);
        if (parsed && parsed.src) {
          const nodeSize = current.nodeSize;
          const resolvedSrc = imageResolveCtx.collectionId &&
              imageResolveCtx.notePath
            ? resolveImageUrl(
              parsed.src,
              imageResolveCtx.collectionId,
              imageResolveCtx.notePath,
            )
            : parsed.src;
          const attrs = {
            src: resolvedSrc,
            alt: parsed.alt,
            title: parsed.title || null,
            markdown: text,
          };
          current = { ...current, attrs: { ...current.attrs, ...attrs } };
          current.nodeSize = nodeSize;
          const tr = editor.state.tr
            .setMeta("imageCommit", true)
            .setNodeMarkup(pos, undefined, attrs);
          editor.view.dispatch(tr);
          return true;
        }
        // Never delete the image just because the edited text didn't parse
        // (e.g. a URL with parentheses/spaces). Silently dropping the node
        // here would erase it from the saved markdown. Only an intentionally
        // emptied field removes the image; otherwise revert and back out.
        if (text.trim() === "") {
          const nodeSize = current.nodeSize;
          editor.view.dispatch(
            editor.state.tr
              .setMeta("imageCommit", true)
              .delete(pos, pos + nodeSize),
          );
          return true;
        }
        return false;
      };

      const commitAndExit = (moveDir?: 1 | -1) => {
        if (!editing) return;
        const pos = typeof getPos === "function" ? getPos() : undefined;
        const nodeSize = current.nodeSize;
        const committed = commitNode();
        if (!committed || typeof pos !== "number") return;
        const near = Selection.near(
          editor.state.doc.resolve(pos + nodeSize),
          typeof moveDir === "number" ? moveDir : 1,
        );
        editor.view.dispatch(
          editor.state.tr
            .setMeta("imageCommit", true)
            .setSelection(near),
        );
        editor.view.focus();
      };

      // -- prevent all events on the span from reaching ProseMirror --
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ev of [
        "mousedown", "mouseup", "click", "dblclick",
        "keydown", "keyup", "keypress",
        "beforeinput", "input",
        "compositionstart", "compositionupdate", "compositionend",
        "paste", "copy", "cut",
      ] as const) {
        editableSpan.addEventListener(ev, (e) => e.stopPropagation());
      }

      editableSpan.addEventListener("keydown", (e) => {
        const text = editableSpan.textContent || "";
        const sel = window.getSelection();
        const atStart = !sel || sel.focusOffset === 0;
        const atEnd = !sel || sel.focusOffset >= text.length;

        if (e.key === "Escape") {
          e.preventDefault();
          commitAndExit();
          return;
        }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          if (atEnd) {
            e.preventDefault();
            commitAndExit(1);
          }
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          if (atStart) {
            e.preventDefault();
            commitAndExit(-1);
          }
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          commitAndExit();
        }
      });

      // -- commit when clicking outside the image (capture phase) --
      const onDocMouseDown = (e: MouseEvent) => {
        if (!editing) return;
        if (
          e.target instanceof globalThis.Node && wrap.contains(e.target)
        ) return;
        commitAndExit();
      };
      document.addEventListener("mousedown", onDocMouseDown, true);

      // -- click image → start editing --
      wrap.addEventListener("click", (e) => {
        if (e.target === img || e.target === wrap) {
          if (!editing) {
            e.preventDefault();
            startEditing();
          }
        }
      });

      // -- selection tracking: auto-enter / auto-exit edit mode --
      let wasInside = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onTransaction = ({ transaction }: any) => {
        if (transaction.getMeta("imageCommit")) return;
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        const inside =
          transaction.selection.from >= pos &&
          transaction.selection.to <= pos + current.nodeSize;
        if (wasInside && !inside && editing) {
          wasInside = false;
          commitNode();
          return;
        }
        if (inside && !wasInside && !editing && ready) startEditing();
        wasInside = inside;
      };
      editor.on("transaction", onTransaction);

      return {
        dom: wrap,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update(updated: any) {
          if (updated.type.name !== current.type.name) return false;
          current = updated;
          img.src = current.attrs.src as string;
          img.alt = (current.attrs.alt as string) ?? "";
          img.title = (current.attrs.title as string) ?? "";
          refreshOverlay();
          return true;
        },
        destroy() {
          editor.off("transaction", onTransaction);
          document.removeEventListener("mousedown", onDocMouseDown, true);
        },
      };
    };
  },
});
import { Extension } from "@tiptap/core";
import type { AnyExtension } from "@tiptap/core";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import { Markdown } from "tiptap-markdown";
import taskListPlugin from "markdown-it-task-lists";
import { getCodeRenderer, registerCodeRenderer } from "./codeRenderers.ts";
import {
  highlightDecorations,
  HL_REFRESH,
  setHighlightRefreshNotify,
} from "./highlight.ts";
import { parseFence, patchFenceRenderer } from "./fence.ts";
import { BUILTIN_PLUGINS } from "../plugins/index.ts";

/**
 * Mutable context for resolving relative image URLs in the editor.
 * Updated by EditorPane when a note is loaded.
 */
export const imageResolveCtx: {
  collectionId: string | null;
  notePath: string | null;
} = { collectionId: null, notePath: null };

/**
 * Resolve a possibly-relative image URL against the current note's path
 * and return a URL that points to the backend file-serving endpoint.
 */
function resolveImageUrl(
  src: string,
  collectionId: string,
  notePath: string,
): string {
  if (/^(https?:|data:|blob:|file:)/.test(src)) return src;
  const noteDir = notePath.includes("/")
    ? notePath.slice(0, notePath.lastIndexOf("/"))
    : "";
  let resolved: string;
  if (src.startsWith("/")) {
    resolved = src.slice(1);
  } else if (noteDir) {
    resolved = `${noteDir}/${src}`.replace(/\/+/g, "/");
  } else {
    resolved = src;
  }
  // Normalize ../ and ./ segments
  const parts = resolved.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part !== "." && part !== "") stack.push(part);
  }
  resolved = stack.join("/");
  return `/api/file?collectionId=${encodeURIComponent(collectionId)}&path=${
    encodeURIComponent(resolved)
  }`;
}

/**
 * TipTap extension that registers a markdown-it plugin to transform
 * relative image URLs to use the backend file-serving endpoint.
 * The plugin is guarded to prevent multiple applications.
 */
const ImageResolver = Extension.create({
  name: "imageResolver",
  addStorage() {
    return {
      markdown: {
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(md: any) {
            if (md._imageResolveApplied) return;
            md._imageResolveApplied = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const defaultImageRule = md.renderer.rules.image as any;
            md.renderer.rules.image = (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tokens: any,
              idx: number,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              options: any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              env: any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              self: any,
            ) => {
              const token = tokens[idx];
              const src = token.attrGet("src");
              // Preserve original src as data attribute for updateDOM.
              if (src) token.attrSet("data-md-src", src);
              if (
                src && imageResolveCtx.collectionId && imageResolveCtx.notePath
              ) {
                const resolved = resolveImageUrl(
                  src,
                  imageResolveCtx.collectionId,
                  imageResolveCtx.notePath,
                );
                token.attrSet("src", resolved);
              }
              if (defaultImageRule) {
                return defaultImageRule(tokens, idx, options, env, self);
              }
              return self.renderToken(tokens, idx, options);
            };
          },
          updateDOM(element: HTMLElement) {
            for (const img of element.querySelectorAll("img")) {
              const mdSrc = img.getAttribute("data-md-src");
              if (mdSrc) {
                const alt = img.getAttribute("alt") || "";
                const title = img.getAttribute("title") || "";
                const md = title
                  ? `![${alt}](${mdSrc} "${title}")`
                  : `![${alt}](${mdSrc})`;
                img.setAttribute("data-md-src", md);
              }
            }
          },
        },
      },
    };
  },
});

/** Transaction meta key: focus the spec editor of the block at `pos`. */
const FENCE_FOCUS = "cbFenceFocus";

/** Transaction meta key: focus the closing fence of the block at `pos`. */
const FENCE_BOTTOM = "cbFenceBottom";

function isInlineRendered(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: any,
): boolean {
  return getCodeRenderer(node.attrs.language as string | null)?.mode ===
    "inline";
}

/**
 * Arrow keys can't natively enter an inline-rendered code block (its source
 * is display:none while unedited), so this plugin moves the caret across
 * those boundaries explicitly: Down/Right at a boundary enters the block
 * below/right, Up/Left enters the one above/left (caret at its far end),
 * revealing its source via the NodeView's selection tracking.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inlineNavPlugin(blockTypeName: string): any {
  return new Plugin({
    key: new PluginKey("codeBlockInlineNav"),
    props: {
      handleKeyDown(view, event) {
        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
          return false;
        }
        const dir = event.key === "ArrowDown" || event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
        if (!dir) return false;

        const { state } = view;
        const { $head, empty } = state.selection;
        if (!empty) return false;

        // Only act at the visual edge of the caret's own block.
        const vertical = event.key === "ArrowDown" || event.key === "ArrowUp";
        const atEdge = vertical
          ? view.endOfTextblock(dir === 1 ? "down" : "up")
          : dir === 1
          ? $head.parentOffset === $head.parent.content.size
          : $head.parentOffset === 0;
        if (!atEdge) return false;

        // Inside a code block moving up/left across its first line/edge:
        // hand control to its own opening-fence editor before considering
        // jumps to neighbouring blocks (the NodeView listens for this meta
        // and focuses the spec input).
        if (
          dir === -1 && $head.parent.type.name === blockTypeName &&
          (vertical ? view.endOfTextblock("up") : $head.parentOffset === 0)
        ) {
          view.dispatch(
            state.tr.setMeta(FENCE_FOCUS, { pos: $head.before($head.depth) }),
          );
          return true;
        }

        // Walk outward through the blocks containing the caret; at each
        // level, check the adjacent sibling block.
        for (let d = $head.depth; d >= 1; d--) {
          const parent = $head.node(d - 1);
          const i = $head.indexAfter(d - 1) - 1;
          const j = dir === 1 ? i + 1 : i - 1;
          if (j < 0 || j >= parent.childCount) continue;
          const sibling = parent.child(j);
          if (sibling.type.name !== blockTypeName) continue;
          const outerPos = dir === 1 ? $head.after(d) : $head.before(d);

          if (dir === 1) {
            // Entering from above/right: stop on the opening fence line —
            // move the caret inside (reveals the block, fences included)
            // and ask its NodeView to focus the spec editor.
            view.dispatch(
              state.tr
                .setSelection(TextSelection.create(state.doc, outerPos + 1))
                .setMeta(FENCE_FOCUS, { pos: outerPos })
                .scrollIntoView(),
            );
            return true;
          }
          // Entering from below/left: only inline-rendered blocks need
          // help (their source is hidden); land at the code's last
          // position. Plain blocks are entered natively.
          if (!isInlineRendered(sibling)) continue;
          view.dispatch(
            state.tr.setSelection(TextSelection.create(state.doc, outerPos - 1))
              .scrollIntoView(),
          );
          return true;
        }
        return false;
      },
    },
  });
}

/**
 * ArrowDown reaching the bottom edge of a code block parks the caret on
 * its closing fence — exactly as if the revealed ``` line had been
 * clicked — regardless of what follows (another code block, a paragraph,
 * or the end of the document). From there, Enter creates the missing
 * empty line below the block.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function focusBottomFenceFromEnd(editor: any, blockTypeName: string): boolean {
  const { state } = editor;
  const { $head, empty } = state.selection;
  if (!empty || $head.parent.type.name !== blockTypeName) return false;
  // Anywhere on the block's last line counts as its bottom edge — that's
  // where the caret actually sits while typing.
  if (!editor.view.endOfTextblock("down")) return false;
  editor.view.dispatch(
    state.tr
      .setMeta(FENCE_BOTTOM, { pos: $head.before($head.depth) })
      .scrollIntoView(),
  );
  return true;
}

/**
 * Mirror case for ArrowUp at the very start of a code block whose previous
 * sibling is another code block: move the caret onto THAT block's closing
 * fence instead of into its last line.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function focusBottomFenceFromStart(
  editor: any,
  blockTypeName: string,
): boolean {
  const { state } = editor;
  const { $head, empty } = state.selection;
  if (!empty || $head.parent.type.name !== blockTypeName) return false;
  // Mirror of the bottom edge: anywhere on the first line.
  if (!editor.view.endOfTextblock("up")) return false;
  const d = $head.depth;
  const parent = $head.node(d - 1);
  const i = $head.indexAfter(d - 1) - 1;
  if (i < 1 || parent.child(i - 1).type.name !== blockTypeName) return false;
  const prev = parent.child(i - 1);
  // Just before this block = end of the previous one; its last inner pos.
  const boundary = $head.before(d);
  editor.view.dispatch(
    state.tr
      .setSelection(TextSelection.create(state.doc, boundary - 1))
      .setMeta(FENCE_BOTTOM, { pos: boundary - prev.nodeSize })
      .scrollIntoView(),
  );
  return true;
}

/** RenderableCodeBlock: the standard TipTap code block with
 * - syntax highlighting via Shiki decorations (see highlight.ts)
 * - verbatim round-tripping of Expressive Code opening-fence info
 *   (`ts {1, 4, 7-8} title="x.ts" ins={2} "text" /re/ wrap`) through the
 *   markdown serializer and tiptap-markdown's markdown-it parser
 * - a NodeView that shows plugin-rendered output: below the source by
 *   default ("below" mode), or replacing it while not being edited
 *   ("inline" mode, e.g. ```mermaid). Double-click the language chip to
 *   change it; click an inline rendering — or arrow into it — to edit its
 *   source.
 */

/**
 * If `text` is exactly one fenced block (as our markdown clipboard
 * serializer produces for any copied code-block fragment), return the
 * inner lines — including their natural trailing newline — with the
 * fences stripped. Otherwise null. Exported for headless tests.
 */
export function unwrapFencedClipboard(text: string): string | null {
  const t = text.replace(/\r\n/g, "\n");
  const firstNl = t.indexOf("\n");
  if (firstNl === -1) return null;
  if (!/^(`{3,}|~{3,})/.test(t.slice(0, firstNl))) return null;
  // The last non-empty line must be a bare closing fence.
  let lastLineStart = t.length;
  let scanEnd = t.length;
  for (;;) {
    lastLineStart = t.lastIndexOf("\n", scanEnd - 2) + 1;
    const line = t.slice(lastLineStart, scanEnd).trim();
    if (line) {
      if (!/^(`{3,}|~{3,})$/.test(line)) return null;
      break;
    }
    if (lastLineStart === 0) return null;
    scanEnd = lastLineStart; // skip trailing blank lines
  }
  return t.slice(firstNl + 1, lastLineStart);
}

/**
 * Pasting inside a code block: when the clipboard carries our own
 * fully-fenced markdown (copying any code-block fragment serializes that
 * way), strip the fences and insert the plain lines instead of nesting
 * literal ``` fences inside the block.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function codeBlockPastePlugin(blockTypeName: string): any {
  return new Plugin({
    key: new PluginKey("codeBlockPasteFix"),
    props: {
      handlePaste(view, event) {
        const { state } = view;
        const { $from, $to } = state.selection;
        const nodeType = state.schema.nodes[blockTypeName];
        if (
          !nodeType || $from.parent.type !== nodeType ||
          $to.parent !== $from.parent
        ) {
          return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = (event as any).clipboardData?.getData?.("text/plain");
        if (!text) return false;
        const body = unwrapFencedClipboard(text);
        if (body === null || !body.length) return false;

        // Keep the pasted content on its own line(s).
        let insert = body;
        if (!insert.startsWith("\n")) {
          const before = $from.parent.textBetween(
            0,
            $from.parentOffset,
            undefined,
            "\ufffc",
          );
          if (before && !before.endsWith("\n")) insert = `\n${insert}`;
        }
        view.dispatch(
          state.tr.replaceSelectionWith(state.schema.text(insert))
            .scrollIntoView(),
        );
        return true;
      },
    },
  });
}

/**
 * RenderableCodeBlock: the standard TipTap code block with
 * - syntax highlighting via Shiki decorations (see highlight.ts)
 * - verbatim round-tripping of Expressive Code opening-fence info
 *   (`ts {1, 4, 7-8} title="x.ts" ins={2} "text" /re/ wrap`) through the
 *   markdown serializer and tiptap-markdown's markdown-it parser
 * - fence-aware clipboard handling (see codeBlockPastePlugin)
 * - a NodeView that shows plugin-rendered output: below the source by
 *   default ("below" mode), or replacing it while not being edited
 *   ("inline" mode, e.g. ```mermaid). Double-click the language chip to
 *   change it; click an inline rendering — or arrow into it — to edit its
 *   source.
 */
// Exported for headless tests (tests/editorIntegration.test.ts).
export const RenderableCodeBlock = CodeBlock.extend({
  addAttributes() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parent = (this.parent?.() ?? {}) as Record<string, any>;
    return {
      ...parent,
      language: {
        ...parent.language,
        default: null,
        parseHTML(element: HTMLElement) {
          const info = element.firstElementChild?.getAttribute("data-info");
          if (info !== null && info !== undefined) {
            const trimmed = info.trim();
            if (trimmed) return trimmed;
          }
          // No data-info (indented code, foreign HTML): stock extraction.
          return typeof parent.language?.parseHTML === "function"
            ? parent.language.parseHTML(element)
            : null;
        },
      },
    };
  },

  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          state.write("```" + (node.attrs.language || "") + "\n");
          state.text(node.textContent, false);
          state.ensureNewLine();
          state.write("```");
          state.closeBlock(node);
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(markdownit: any) {
            markdownit.set({ langPrefix: "language-" });
            patchFenceRenderer(markdownit);
          },
          updateDOM(element: HTMLElement) {
            element.innerHTML = element.innerHTML.replace(
              /\n<\/code><\/pre>/g,
              "</code></pre>",
            );
          },
        },
      },
    };
  },

  addKeyboardShortcuts() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parent = (this.parent?.() ?? {}) as Record<string, any>;
    return {
      ...parent,
      // Between two adjacent code blocks the stock behaviour (jump/exit
      // into the next one) makes an empty line impossible to insert; route
      // those edges onto the closing fence instead (see helpers above).
      ArrowDown: ({ editor }: any) =>
        focusBottomFenceFromEnd(editor, this.name) ||
        (typeof parent.ArrowDown === "function"
          ? parent.ArrowDown({ editor })
          : false),
      ArrowUp: ({ editor }: any) =>
        focusBottomFenceFromStart(editor, this.name),
    };
  },

  addProseMirrorPlugins() {
    const blockTypeName = this.name;
    const key = new PluginKey("codeBlockHighlight");
    return [
      new Plugin({
        key,
        state: {
          init: (_, { doc }) => highlightDecorations(doc, blockTypeName),
          apply: (tr, value) =>
            tr.getMeta(HL_REFRESH) || tr.docChanged
              ? highlightDecorations(tr.doc, blockTypeName)
              : value.map(tr.mapping, tr.doc),
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
        view(view) {
          // Async language loads (and Shiki init) recompute decorations
          // through this hook.
          const unregister = setHighlightRefreshNotify(() =>
            view.dispatch(view.state.tr.setMeta(HL_REFRESH, true))
          );
          return {
            destroy() {
              unregister();
            },
          };
        },
      }),
      inlineNavPlugin(blockTypeName),
      codeBlockPastePlugin(blockTypeName),
    ];
  },

  addNodeView() {
    const blockTypeName = this.name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ node, editor, getPos }: any) => {
      const outer = document.createElement("div");
      outer.className = "cb-wrap";

      const chip = document.createElement("span");
      chip.className = "cb-lang";
      chip.title = "Language / options";
      const chipLabel = document.createElement("span");
      chip.appendChild(chipLabel);

      // Expressive Code `title="…"` (shown next to the language chip).
      const titleEl = document.createElement("span");
      titleEl.className = "cb-title";

      // Revealed fence lines: the opening one carries the editable spec.
      const fenceTop = document.createElement("div");
      fenceTop.className = "cb-fence";
      fenceTop.title =
        'Fence — click to edit language/options (e.g. ts {1,3-5} ins={2} title="x.ts"); Esc/↓ back to code';
      const btPrefix = document.createElement("span");
      btPrefix.textContent = "```";
      const specLabel = document.createElement("span");
      specLabel.className = "cb-spec";
      const specInput = document.createElement("input");
      specInput.type = "text";
      specInput.className = "cb-spec-input";
      specInput.spellcheck = false;
      specInput.placeholder =
        'lang {1,2-3} mark={} ins={} del={} "text" /regex/ title="…" wrap';
      fenceTop.append(btPrefix, specLabel, specInput);

      const fenceBottom = document.createElement("div");
      fenceBottom.className = "cb-fence cb-fence-bottom";
      fenceBottom.textContent = "```";
      fenceBottom.tabIndex = -1;
      fenceBottom.title =
        "Closing fence — click here, then Enter inserts an empty line below the block (↑/Esc back to code)";

      const pre = document.createElement("pre");
      const codeEl = document.createElement("code");
      pre.appendChild(codeEl);
      const preview = document.createElement("div");
      preview.className = "cb-preview";

      outer.appendChild(chip);
      outer.appendChild(titleEl);
      outer.appendChild(fenceTop);
      outer.appendChild(pre);
      outer.appendChild(fenceBottom);
      outer.appendChild(preview);

      let cleanup: (() => void) | undefined;
      // True while the text caret/selection is inside this block. Only
      // relevant for "inline" renderers (mermaid): they hide their output
      // while editing so you always work on plain source.
      let editing = false;
      // True while the opening-fence spec input is open.
      let specEditing = false;
      // True while the caret is parked on the closing fence.
      let fenceFocus = false;

      const clearPreview = () => {
        cleanup?.();
        cleanup = undefined;
        preview.innerHTML = "";
        preview.classList.remove("cb-placeholder", "cb-error");
      };

      /** Reconcile DOM visibility + preview content with current state. */
      const refresh = () => {
        clearPreview();
        const language = node.attrs.language as string | null;
        const renderer = getCodeRenderer(language);
        // Read from the model, not contentDOM: at NodeView creation time
        // ProseMirror hasn't mounted the node's content into the DOM yet.
        const code = node.textContent ?? "";

        // Fence lines are shown only while the block is being edited.
        fenceTop.style.display = editing ? "" : "none";
        fenceBottom.style.display = editing ? "" : "none";
        if (editing && !specEditing) {
          specLabel.textContent = language ?? "";
        }

        if (renderer?.mode === "inline") {
          outer.classList.add("cb-inline");
          outer.classList.toggle("cb-editing", editing);
          if (editing) {
            preview.style.display = "none";
            pre.style.display = "";
            return;
          }
          pre.style.display = "none";
          preview.style.display = "";
          if (code.trim()) {
            cleanup = renderer(preview, code) || undefined;
          } else {
            preview.classList.add("cb-placeholder");
            preview.textContent = `Empty ${language} block — click to edit`;
          }
          return;
        }

        outer.classList.remove("cb-inline", "cb-editing");
        pre.style.display = "";
        if (renderer && code.trim()) {
          preview.style.display = "";
          cleanup = renderer(preview, code) || undefined;
        } else {
          preview.style.display = "none";
        }
      };

      const syncMeta = () => {
        const raw = node.attrs.language as string | null;
        const info = parseFence(raw);
        chipLabel.textContent = info.lang ?? "code";
        chip.title = raw || "Language / options";
        codeEl.className = info.lang ? `language-${info.lang}` : "";
        titleEl.textContent = info.title ?? "";
        titleEl.style.display = info.title ? "" : "none";
        outer.classList.toggle("cb-wrap--wrap", info.wrap);
      };

      const posInsideSelection = (): boolean => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return false;
        const end = pos + node.nodeSize;
        const { from, to } = editor.state.selection;
        return from > pos && to < end;
      };

      // Enter edit mode when the selection moves into the block, leave
      // (and re-render inline output) when it moves out again. Also picks
      // up requests (from the nav plugin) to focus the spec editor.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onTransaction = ({ transaction }: any) => {
        const focusReq = transaction.getMeta(FENCE_FOCUS);
        if (
          focusReq && typeof getPos === "function" &&
          focusReq.pos === getPos()
        ) openSpecEditor();
        const bottomReq = transaction.getMeta(FENCE_BOTTOM);
        if (
          bottomReq && typeof getPos === "function" &&
          bottomReq.pos === getPos()
        ) openBottomFence();
        const inside = posInsideSelection();
        if (!inside && fenceFocus) closeBottomFence(false);
        if (inside !== editing) {
          editing = inside;
          refresh();
        }
      };
      editor.on("transaction", onTransaction);

      /** Put the caret into the code content (first position). */
      const caretToCodeStart = () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        editor.view.dispatch(
          editor.state.tr
            .setSelection(TextSelection.create(editor.state.doc, pos + 1))
            .scrollIntoView(),
        );
        editor.view.focus();
      };

      /** Put the caret at the very end of the code content. */
      const caretToCodeEnd = () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        editor.view.dispatch(
          editor.state.tr
            .setSelection(
              TextSelection.create(
                editor.state.doc,
                Math.max(pos + 1, pos + node.nodeSize - 1),
              ),
            )
            .scrollIntoView(),
        );
        editor.view.focus();
      };

      const openSpecEditor = () => {
        if (specEditing) return;
        specEditing = true;
        specInput.value = (node.attrs.language as string | null) ?? "";
        specLabel.style.display = "none";
        // Explicit value: "" would just clear the inline override and let
        // the stylesheet's display:none keep hiding the input.
        specInput.style.display = "inline-block";
        // Defer: if we focus during the dispatch, ProseMirror's selection
        // sync for the same transaction steals focus back to the view.
        setTimeout(() => {
          if (!specEditing) return;
          specInput.focus();
          specInput.select();
        }, 0);
      };

      const closeSpecEditor = () => {
        if (!specEditing) return;
        specEditing = false;
        specInput.style.display = "none";
        specLabel.style.display = "";
        specLabel.textContent = (node.attrs.language as string | null) ?? "";
      };

      /** Close + apply the edited spec; optionally move caret into code.
       * The fence info is stored verbatim (trimmed) so Expressive Code
       * meta round-trips losslessly. */
      const commitSpecEditor = (refocusCode = false) => {
        if (!specEditing) return;
        const normalized = specInput.value.trim();
        closeSpecEditor();
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (
          typeof pos === "number" &&
          (node.attrs.language ?? null) !== normalized
        ) {
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              language: normalized.length ? normalized : null,
            }),
          );
        }
        syncMeta();
        if (refocusCode) caretToCodeStart();
      };

      /** Commit and leave the block through its top/left side. */
      const exitBlockBackward = () => {
        commitSpecEditor(false);
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        const sel = Selection.near(
          editor.state.doc.resolve(Math.max(0, pos)),
          -1,
        );
        if (sel.from < pos) {
          editor.view.dispatch(
            editor.state.tr.setSelection(sel).scrollIntoView(),
          );
          editor.view.focus();
        } else {
          caretToCodeStart(); // no earlier block — stay in the code
        }
      };

      /** Park the caret on the closing fence (visual focus, DOM focus). */
      const openBottomFence = () => {
        if (fenceFocus) return;
        closeSpecEditor();
        fenceFocus = true;
        fenceBottom.classList.add("cb-fence-focus");
        // Defer like the spec input: focusing during the dispatch would
        // let ProseMirror's selection sync steal focus back to the view.
        setTimeout(() => {
          if (fenceFocus) fenceBottom.focus();
        }, 0);
      };

      /** Leave closing-fence mode; optionally drop back into the code. */
      const closeBottomFence = (backToCode = false) => {
        if (!fenceFocus) return;
        fenceFocus = false;
        fenceBottom.classList.remove("cb-fence-focus");
        if (document.activeElement === fenceBottom) fenceBottom.blur();
        if (backToCode) caretToCodeEnd();
      };

      /**
       * The closing fence's Enter: create an empty paragraph directly
       * after the block and put the caret in it — the only way to insert
       * a line between two adjacent code blocks. An empty paragraph that
       * is already there is reused rather than duplicated.
       */
      const newlineAfterBlock = () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        const { state } = editor;
        const end = pos + node.nodeSize;
        const $end = state.doc.resolve(end);
        const index = $end.indexAfter($end.depth);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const para = state.schema.nodes.paragraph as any | undefined;
        const next = $end.parent.maybeChild(index);
        const tr = state.tr;
        if (
          para && $end.parent.canReplaceWith(index, index, para) &&
          !(next?.type === para && next.content.size === 0)
        ) {
          tr.insert(end, para.create());
          tr.setSelection(TextSelection.create(tr.doc, end + 1));
        } else {
          // No paragraph allowed there (or one exists already): fall
          // through to the nearest valid text position.
          tr.setSelection(Selection.near(tr.doc.resolve(end), 1));
        }
        tr.scrollIntoView();
        editor.view.dispatch(tr);
        editor.view.focus();
      };

      /**
       * Leave the block through its bottom/right side. At the very end
       * of the document nothing follows, and Selection.near would bounce
       * back into the code — create the line instead.
       *
       * When a code block directly follows (no blank line between), the
       * forward selection lands inside its code — hand control to that
       * block's opening-fence editor, exactly like inlineNavPlugin does
       * when entering from an adjacent paragraph.
       */
      const exitBlockForward = () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        const end = pos + node.nodeSize;
        const sel = Selection.near(editor.state.doc.resolve(end), 1);
        if (sel.from < end) {
          newlineAfterBlock();
          return;
        }
        if (sel.$from.parent.type.name === blockTypeName) {
          editor.view.dispatch(
            editor.state.tr
              .setSelection(TextSelection.create(editor.state.doc, end + 1))
              .setMeta(FENCE_FOCUS, { pos: end })
              .scrollIntoView(),
          );
          editor.view.focus();
          return;
        }
        editor.view.dispatch(
          editor.state.tr.setSelection(sel).scrollIntoView(),
        );
        editor.view.focus();
      };

      // Clicking a rendered inline block puts the caret into its source.
      outer.addEventListener("click", (e) => {
        if (editing || !outer.classList.contains("cb-inline")) return;
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        e.preventDefault();
        const end = Math.max(pos + 1, pos + node.nodeSize - 1);
        editor.view.dispatch(
          editor.state.tr
            .setSelection(TextSelection.create(editor.state.doc, end))
            .scrollIntoView(),
        );
        editor.view.focus();
      });

      // The opening fence line edits the spec.
      fenceTop.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSpecEditor();
      });
      // The corner chip mirrors the spec and opens the fence editor. It
      // first moves the caret into the block so "editing" mode (and the
      // fence lines) turn on — this is also the entry point while an
      // inline chart covers the block.
      chip.addEventListener("mousedown", (e) => e.stopPropagation());
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        caretToCodeStart();
        openSpecEditor();
      });

      // Clicking the closing fence parks the caret on it; from there,
      // Enter inserts an empty line below the block.
      // No preventDefault on mousedown: the default action is what gives
      // the fence (tabIndex=-1) DOM focus.
      fenceBottom.addEventListener("mousedown", (e) => e.stopPropagation());
      fenceBottom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openBottomFence();
      });
      // Keep every event away from ProseMirror while the fence has focus,
      // exactly like the spec input above.
      for (
        const ev of [
          "mousedown",
          "mouseup",
          "click",
          "dblclick",
          "keydown",
          "keyup",
          "keypress",
          "beforeinput",
          "input",
          "compositionstart",
          "compositionupdate",
          "compositionend",
          "paste",
          "copy",
          "cut",
        ]
      ) {
        fenceBottom.addEventListener(ev, (e) => e.stopPropagation());
      }
      fenceBottom.addEventListener("keydown", (e) => {
        switch (e.key) {
          case "Enter":
            e.preventDefault();
            closeBottomFence(false);
            newlineAfterBlock();
            break;
          case "Tab":
          case "ArrowDown":
          case "ArrowRight":
            e.preventDefault();
            closeBottomFence(false);
            exitBlockForward();
            break;
          case "Backspace":
          case "ArrowUp":
          case "ArrowLeft":
          case "Escape":
            e.preventDefault();
            closeBottomFence(true);
            break;
        }
      });
      fenceBottom.addEventListener("blur", () => closeBottomFence(false));

      // Keep every event from the spec input away from ProseMirror so
      // typing can't trigger editor keymaps or selections.
      for (
        const ev of [
          "mousedown",
          "mouseup",
          "click",
          "dblclick",
          "keydown",
          "keyup",
          "keypress",
          "beforeinput",
          "input",
          "compositionstart",
          "compositionupdate",
          "compositionend",
          "paste",
          "copy",
          "cut",
        ]
      ) {
        specInput.addEventListener(ev, (e) => e.stopPropagation());
      }
      specInput.addEventListener("keydown", (e) => {
        const atStart = specInput.selectionStart === 0 &&
          specInput.selectionEnd === 0;
        const len = specInput.value.length;
        const atEnd = specInput.selectionStart === len &&
          specInput.selectionEnd === len;

        switch (e.key) {
          case "Enter":
          case "Tab":
          case "ArrowDown":
            e.preventDefault();
            commitSpecEditor(true);
            break;
          case "Escape":
            e.preventDefault();
            closeSpecEditor();
            caretToCodeStart();
            break;
          case "ArrowUp":
            e.preventDefault();
            exitBlockBackward();
            break;
          case "ArrowRight":
            if (atEnd) {
              e.preventDefault();
              commitSpecEditor(true);
            }
            break;
          case "ArrowLeft":
            if (atStart) {
              e.preventDefault();
              exitBlockBackward();
            }
            break;
        }
      });
      specInput.addEventListener("blur", () => commitSpecEditor(false));

      syncMeta();
      editing = posInsideSelection();
      refresh();

      return {
        dom: outer,
        contentDOM: codeEl,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update(updated: any) {
          if (updated.type.name !== node.type.name) return false;
          // Decorations elsewhere in the doc also trigger update(); only
          // re-render when this block's content or language changed.
          const changed = updated.textContent !== node.textContent ||
            updated.attrs.language !== node.attrs.language;
          node = updated;
          syncMeta();
          if (changed) refresh();
          return true;
        },
        destroy() {
          editor.off("transaction", onTransaction);
          cleanup?.();
        },
        ignoreMutation(m: MutationRecord | { type: string; target: Node }) {
          return !(codeEl === (m as MutationRecord).target) &&
            !codeEl.contains((m as MutationRecord).target as Node | null);
        },
      };
    };
  },
});

export interface PluginContribution {
  extensions: AnyExtension[];
  toolbar: { id: string; label: string; run(): void }[];
}

/**
 * TaskList plus an explicit `tight` attribute: prosemirror-markdown only
 * emits compact `- [ ]` lines when the list node carries tight=true, and
 * tiptap-markdown's tight-list handling doesn't cover taskList nodes.
 *
 * The markdown parse spec is owned here (replacing tiptap-markdown's
 * bundled one) so two gaps in markdown-it-task-lists can be closed:
 *   - bare checkboxes ("- [ ]" with nothing after) are not recognized —
 *     pad them so save/reload of an emptied item round-trips;
 *   - todoify leaves the separator space in the following text node,
 *     which surfaces as a double space after pasting checklist text.
 */
export const TightTaskList = TaskList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tight: {
        default: true,
        parseHTML: (element) =>
          element.getAttribute("data-tight") === "true" ||
          !element.querySelector("p"),
        renderHTML: (attributes) => ({
          "data-tight": attributes.tight ? "true" : null,
        }),
      },
    };
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addStorage() {
    return {
      markdown: {
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(markdownit: any) {
            markdownit.use(taskListPlugin);
            markdownit.core.ruler.before(
              "github-task-lists",
              "cambium-pad-bare-checkbox",
              (state: any) => {
                for (const token of state.tokens) {
                  const first = token.type === "inline"
                    ? token.children?.[0]
                    : null;
                  if (
                    first?.type === "text" && /^\[[xX ]\]$/.test(first.content)
                  ) {
                    first.content += " ";
                    token.content += " ";
                  }
                }
              },
            );
            markdownit.core.ruler.after(
              "github-task-lists",
              "cambium-trim-checkbox-space",
              (state: any) => {
                for (const token of state.tokens) {
                  const children = token.children;
                  if (!children?.length) continue;
                  for (let i = 0; i < children.length - 1; i++) {
                    if (
                      children[i].type === "html_inline" &&
                      children[i].content.startsWith("<input")
                    ) {
                      const next = children[i + 1];
                      if (
                        next.type === "text" && next.content.startsWith(" ")
                      ) {
                        next.content = next.content.slice(1);
                      }
                    }
                  }
                }
              },
            );
          },
          updateDOM(element: Element) {
            [...element.querySelectorAll(".contains-task-list")].forEach(
              (list) => {
                list.setAttribute("data-type", "taskList");
              },
            );
          },
        },
      },
    };
  },
});

/** Runs all builtin plugins and returns their contributions. */
function loadPlugins(): PluginContribution {
  const acc: PluginContribution = { extensions: [], toolbar: [] };
  for (const p of BUILTIN_PLUGINS) {
    try {
      p.setup({
        registerCodeRenderer,
        registerExtension: (ext) => acc.extensions.push(ext as AnyExtension),
        registerToolbar: (item) =>
          acc.toolbar.push({ id: item.id, label: item.label, run: item.run }),
      });
    } catch (e) {
      console.error(`Plugin ${p.name} failed to load:`, e);
    }
  }
  return acc;
}

const contributions = loadPlugins();

export function buildExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      horizontalRule: {},
    }),
    RenderableCodeBlock.configure({
      languageClassPrefix: "language-",
    }),
    Link.configure({ openOnClick: false, autolink: true }),
    EditableImage,
    TightTaskList,
    // nested: allow lists (incl. other task lists) inside a task item
    TaskItem.configure({ nested: true }),
    Markdown.configure({
      html: false,
      linkify: true,
      breaks: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
    ImageResolver,
    ...contributions.extensions,
  ];
}

export function getMarkdown(editor: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage = editor.storage as any;
  return storage.markdown?.getMarkdown?.() ?? editor.getText();
}
