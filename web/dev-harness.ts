import { Editor } from "@tiptap/core";
import { buildExtensions } from "./editor/extensions.ts";

const DOC = `Intro paragraph before.

\`\`\`ts
const a = 1;
const b = 2;
\`\`\`

Middle paragraph.

\`\`\`mermaid
graph LR; A-->B;
\`\`\`

Score paragraph.

\`\`\`abc
X:1
T:Scale
M:4/4
K:C
CDEF GABc
\`\`\`

Final paragraph after.
`;

const editor = new Editor({
  element: document.getElementById("host")!,
  extensions: buildExtensions(),
  content: DOC,
});

// expose for the CDP driver
Object.assign(window as never, {
  __cb: {
    editor,
    doc: DOC,
    sel: () => {
      const s = editor.state.selection;
      return { from: s.from, to: s.to, empty: s.empty };
    },
    setSel: (pos: number) => {
      const { TextSelection } = window.__cb.pm.state;
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, pos),
        ),
      );
      editor.view.focus();
    },
    key: (key: string) => {
      const target = document.activeElement ?? editor.view.dom;
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      return {
        sel: (window as unknown as HarnessWindow).__cb.sel(),
        active: document.activeElement?.className ?? "none",
        fences: [...document.querySelectorAll(".cb-fence")].map(
          (f) => (f as HTMLElement).style.display || "(shown)",
        ),
        chips: [...document.querySelectorAll(".cb-lang")].map((c) => ({
          text: c.textContent,
          visible: !!(c as HTMLElement).offsetParent ||
            getComputedStyle(c).position === "absolute",
        })),
      };
    },
    pm: {
      state: await import("@tiptap/pm/state"),
    },
  },
});

interface HarnessWindow extends Window {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __cb: any;
}
