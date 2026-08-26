/**
 * Headless integration tests for the RenderableCodeBlock extension:
 * markdown round-trip of Expressive Code fence info, multi-line code
 * blocks, and live Shiki highlighting. Runs under happy-dom.
 */

// happy-dom globals must exist before any DOM-touching module is imported.
import { Window } from "npm:happy-dom@^20.11.6";

const win = new Window({ url: "http://localhost/" });
const g = globalThis as unknown as Record<string, unknown>;
for (
  const key of [
    "window",
    "document",
    "HTMLElement",
    "HTMLIFrameElement",
    "Element",
    "Node",
    "Text",
    "KeyboardEvent",
    "MouseEvent",
    "Event",
    "CustomEvent",
    "MutationObserver",
    "getSelection",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ]
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
g.getSelection = () => win.window.getSelection?.() ?? null;

const { Editor } = await import("@tiptap/core");
const StarterKit = (await import("@tiptap/starter-kit")).default;
const Link = (await import("@tiptap/extension-link")).default;
const { Markdown } = await import("tiptap-markdown");
const {
  RenderableCodeBlock,
  getMarkdown,
} = await import("../web/editor/extensions.ts");
const {
  highlightDecorations,
  highlighterState,
} = await import("../web/editor/highlight.ts");
const { assertEquals } = await import("@std/assert");

function makeEditor(content = "") {
  return new Editor({
    element: null as unknown as HTMLElement,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      RenderableCodeBlock.configure({ languageClassPrefix: "language-" }),
      Link.configure({ openOnClick: false }),
      Markdown.configure({ html: false, linkify: true, breaks: false }),
    ],
    content,
  });
}

function makeAttachedEditor(content: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      RenderableCodeBlock.configure({ languageClassPrefix: "language-" }),
      Link.configure({ openOnClick: false }),
      Markdown.configure({ html: false, linkify: true, breaks: false }),
    ],
    content,
  });
  return { editor, host };
}

Deno.test("fence info round-trips through the real parser/serializer", () => {
  const md = '```ts {1, 4} title="demo.ts" ins={2}\nconst a = 1;\n```\n';
  const editor = makeEditor(md);
  try {
    let found: string | null | undefined;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "codeBlock") found = node.attrs.language;
      return true;
    });
    assertEquals(found, 'ts {1, 4} title="demo.ts" ins={2}');
    // The markdown serializer drops the document-final newline (same as
    // tiptap-markdown's stock code-block spec — verified against control).
    assertEquals(getMarkdown(editor), md.replace(/\n$/, ""));
  } finally {
    editor.destroy();
  }
});

Deno.test("plain fenced blocks stay plain (multi-line preserved)", () => {
  const md = "```\nline one\nline two\n```\n";
  const editor = makeEditor(md);
  try {
    let text: string | null = null;
    let count = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "codeBlock") {
        count++;
        text = node.textContent;
      }
      return true;
    });
    assertEquals(count, 1);
    assertEquals(text, "line one\nline two");
    assertEquals(getMarkdown(editor), "```\nline one\nline two\n```");
  } finally {
    editor.destroy();
  }
});

Deno.test("Enter inserts a newline inside a code block", async () => {
  const editor = makeEditor("```\nhello\n```\n");
  try {
    // Put the caret at the end of the code content ("hello|").
    const pos: number[] = [];
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === "codeBlock") pos.push(p + node.nodeSize - 1);
      return true;
    });
    editor.commands.focus();
    editor.commands.setTextSelection(pos[0]);
    // Wait for the view + NodeView to mount.
    await new Promise((r) => setTimeout(r, 50));
    editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 20));
    let text: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "codeBlock") text = node.textContent;
      return true;
    });
    assertEquals(text, "hello\n");
  } finally {
    editor.destroy();
  }
});

Deno.test("Shiki token decorations appear once languages load", async () => {
  const editor = makeEditor("```ts\nconst a = 1;\n```\n");
  try {
    // Shiki init + ts grammar load are async; poll for up to 10s.
    let decoClasses: string[] = [];
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const set = highlightDecorations(editor.state.doc, "codeBlock");
      decoClasses = [];
      set.find().forEach((d) => {
        const cls = (d as unknown as { type?: { attrs?: { class?: string } } })
          .type?.attrs?.class;
        if (cls) decoClasses.push(cls);
      });
      if (decoClasses.some((c) => c.startsWith("ec-tok-"))) break;
    }
    const tokenDecos = decoClasses.filter((c) => c.startsWith("ec-tok-"));
    if (!(tokenDecos.length > 0)) {
      throw new Error(`no token decorations; got ${JSON.stringify(decoClasses)}`);
    }
    assert(decoClasses.every((c) => !c.includes("hljs")));
  } finally {
    editor.destroy();
  }
});

Deno.test("injected token colors match app theme orientation", async () => {
  const editor = makeEditor("```ts\nconst a = 1;\n```\n");
  try {
    // Wait for tokens (and therefore injected rules) to exist.
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const set = highlightDecorations(editor.state.doc, "codeBlock");
      if (
        set.find().some((d) =>
          String(
            (d as unknown as { type?: { attrs?: { class?: string } } }).type
              ?.attrs?.class,
          ).startsWith("ec-tok-")
        )
      ) break;
    }
    const styleEl = document.getElementById("ec-token-colors") as
      | HTMLStyleElement
      | null;
    if (!styleEl) throw new Error("token style element missing");
    // Rules were added via insertRule(), so they live in the CSSOM.
    const rules = [...(styleEl.sheet?.cssRules ?? [])];
    const baseColors: Record<string, string> = {};
    const lightColors: Record<string, string> = {};
    for (const rule of rules) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { selectorText, style } = rule as any;
      const cls = /ec-tok-[0-9a-z]+/.exec(selectorText ?? "")?.[0];
      if (!cls || !style?.color) continue;
      if ((selectorText as string).startsWith(":root[data-theme=\"light\"]")) {
        lightColors[cls] = String(style.color).toUpperCase();
      } else {
        baseColors[cls] = String(style.color).toUpperCase();
      }
    }
    const classes = Object.keys(baseColors);
    assert(classes.length > 0);
    let checked = 0;
    for (const cls of classes) {
      const base = baseColors[cls];
      const light = lightColors[cls];
      if (!light) continue; // single-color fallback pair
      const lumBase = luminance(base);
      const lumLight = luminance(light);
      // Dark palette on the dark default background must be relatively
      // luminous; the light override must be darker.
      assert(lumBase >= lumLight);
      assert(lumBase > 0.25); // readable against ~#1d2027 background
      checked++;
    }
    assert(checked > 0);
  } finally {
    editor.destroy();
  }
});

Deno.test("line markers render background + a SINGLE accent widget per line", async () => {
  const editor = makeEditor("```ts {1}\nconst a = 1;\n```\n");
  try {
    await new Promise((r) => setTimeout(r, 80));
    const all = [...highlightDecorations(editor.state.doc, "codeBlock").find()];
    // Zero-length widget decoration(s) at the start of the marked line:
    // exactly one accent bar even though tokens split the range.
    const widgetsAtLineStart = all.filter((d) => d.from === 1 && d.to === 1);
    assertEquals(widgetsAtLineStart.length, 1);
    // And the full-line background covers "const a = 1;".
    assert(
      all.some((d) => d.from === 1 && d.to === 1 + "const a = 1;".length),
    );
  } finally {
    editor.destroy();
  }
});

function luminance(hexColor: string): number {
  const hex = hexColor.replace("#", "");
  const full =
    hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex.padEnd(6, "0").slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function assert(cond: boolean, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

Deno.test("pasting a copied line inside a block does not add fences", async () => {
  const { editor, host } = makeAttachedEditor("```js\nx\n```\n");
  try {
    await new Promise((r) => setTimeout(r, 30));
    let blockPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock") blockPos = pos;
      return true;
    });
    // Caret at end of "x".
    editor.commands.setTextSelection(blockPos + 2);

    // Simulate a paste whose text/plain is what our markdown copy
    // serializer produces for a copied code-block line.
    const pasteEvent = new Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getData: (type: string) =>
          type === "text/plain" ? "```js\nx\n```\n" : "",
      },
    });
    editor.view.dom.dispatchEvent(pasteEvent);
    await new Promise((r) => setTimeout(r, 20));

    let count = 0;
    let text: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "codeBlock") {
        count++;
        text = node.textContent;
      }
      return true;
    });
    assertEquals(count, 1);
    const blockText = text as unknown as string;
    assertEquals(blockText, "x\nx\n");
    assert(!blockText.includes("```"));
  } finally {
    host.remove();
    editor.destroy();
  }
});

Deno.test("ArrowDown from closing fence opens the NEXT block's opening fence", async () => {
  // Two ADJACENT code blocks (no blank line between).
  const { editor, host } = makeAttachedEditor(
    "```js\nx\n```\n```css\ny\n```\n",
  );
  try {
    await new Promise((r) => setTimeout(r, 30));
    const positions: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock") positions.push(pos);
      return true;
    });
    assertEquals(positions.length, 2);
    const [block1, block2] = positions;

    // Put the caret inside block 1 so its fences are revealed…
    editor.commands.setTextSelection(block1 + 1 + 1); // end of "x"
    // …then park it on the closing fence via the app's own meta channel
    // ("cbFenceBottom" — FENCE_BOTTOM in extensions.ts).
    editor.view.dispatch(
      editor.state.tr.setMeta("cbFenceBottom", { pos: block1 }),
    );
    await new Promise((r) => setTimeout(r, 50));
    const parked = document.activeElement as HTMLElement | null;
    assert(parked !== null);
    assert(parked.classList.contains("cb-fence-bottom"));

    // ArrowDown on the closing fence must land in block 2 AND open its
    // opening-fence spec editor.
    parked.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 80));

    const selParent = editor.state.selection.$from.parent;
    assertEquals(selParent.type.name, "codeBlock");
    assertEquals(selParent.textContent, "y");
    assertEquals(editor.state.selection.from, block2 + 1);

    const focused = document.activeElement as HTMLElement | null;
    assert(focused !== null);
    assert(
      focused.classList.contains("cb-spec-input"),
      `expected spec input focus, got <${focused.tagName}.${
        focused.className
      }>`,
    );
  } finally {
    host.remove();
    editor.destroy();
  }
});
