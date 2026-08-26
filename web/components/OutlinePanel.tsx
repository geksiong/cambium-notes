import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import { editorRef, useStore } from "../state/store.ts";

interface TocEntry {
  depth: number;
  text: string;
}

/** Distance kept between the scroller top and a jumped-to heading. */
const SCROLL_OFFSET = 20;

function collectHeadings(editor: Editor): TocEntry[] {
  const out: TocEntry[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") {
      out.push({
        depth: Number(node.attrs.level ?? 1),
        text: node.textContent,
      });
    }
    return true;
  });
  return out;
}

/** ProseMirror position of the index-th heading in the current doc. */
function posOfHeading(editor: Editor, index: number): number | null {
  let i = 0;
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "heading") {
      if (i++ === index) {
        found = pos;
        return false;
      }
    }
    return true;
  });
  return found;
}

/**
 * Right-panel table of contents built from the open document's headings.
 * Entries scroll the editor to their heading and the section around the
 * viewport top is highlighted while scrolling.
 */
export function OutlinePanel() {
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const activePath = useStore((s) => s.activePath);
  const notes = useStore((s) => s.notes);

  const key = activeCollectionId && activePath
    ? `${activeCollectionId}:${activePath}`
    : null;
  const note = key ? notes[key] : undefined;

  // Re-collect whenever the note or its body changes; positions are looked
  // up again at click/scroll time so stale coordinates can't misfire.
  const editor = editorRef.current;
  const heads = editor ? collectHeadings(editor) : [];

  const [active, setActive] = useState(-1);

  useEffect(() => {
    setActive(-1);
    if (!note) return;
    const scroller = document.querySelector<HTMLElement>(".prose-host");
    if (!scroller) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const ed = editorRef.current;
      if (!ed) return;
      const entries = collectHeadings(ed);
      const base = scroller.getBoundingClientRect().top;
      let cur = -1;
      for (let i = 0; i < entries.length; i++) {
        const pos = posOfHeading(ed, i);
        if (pos === null) break;
        try {
          const coords = ed.view.coordsAtPos(pos);
          if (coords.top - base <= 96) cur = i;
          else break;
        } catch {
          break;
        }
      }
      setActive(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, note?.body.length]);

  const jump = (index: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    const pos = posOfHeading(ed, index);
    if (pos === null) return;
    try {
      ed.commands.setTextSelection(pos);
    } catch {
      // Caret placement is cosmetic here; never block navigation on it.
    }
    setActive(index);
    // PM's own scrollIntoView is a best-effort hint that often no-ops for
    // block-boundary carets, so scroll .prose-host explicitly from the
    // heading's real coordinates (rAF: let the transaction paint first).
    requestAnimationFrame(() => {
      try {
        const scroller = document.querySelector<HTMLElement>(".prose-host");
        const coords = ed.view.coordsAtPos(pos);
        if (!scroller) {
          ed.commands.scrollIntoView();
          return;
        }
        const rect = scroller.getBoundingClientRect();
        const target = scroller.scrollTop + (coords.top - rect.top) -
          SCROLL_OFFSET;
        scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      } catch {
        ed.commands.scrollIntoView();
      }
    });
  };

  if (!note) {
    return (
      <div className="muted pad small">Open a note to see its outline.</div>
    );
  }

  return (
    <div className="toc-panel">
      <div className="section-label">Contents</div>
      {!heads.length
        ? (
          <div className="muted small">
            No headings yet — add an H1–H3 to build the outline.
          </div>
        )
        : (
          <nav className="toc">
            {heads.map((h, i) => (
              <button
                key={i}
                className={`toc-item l${Math.min(h.depth, 6)} ${
                  i === active ? "on" : ""
                }`}
                title={h.text}
                onClick={() => jump(i)}
              >
                {h.text || "(untitled)"}
              </button>
            ))}
          </nav>
        )}
    </div>
  );
}
