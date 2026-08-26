import { useMemo, useState } from "react";
import type { FileEntry } from "../../src-core/types.ts";
import { msg, useStore } from "../state/store.ts";
import { rpc } from "../transport.ts";

interface SearchHit {
  path: string;
  title: string;
  collectionId: string;
}

export function Explorer() {
  const tree = useStore((s) => s.tree);
  const activePath = useStore((s) => s.activePath);
  const openNote = useStore((s) => s.openNote);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const renameEntry = useStore((s) => s.renameEntry);
  const setDialog = useStore((s) => s.setDialog);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const visible = useMemo(() => {
    const out: FileEntry[] = [];
    let depth = 0;
    for (const e of tree) {
      depth = e.path.split("/").length - 1;
      // hide children of collapsed dirs
      if ([...collapsed].some((c) => e.path.startsWith(c + "/"))) continue;
      out.push(e);
      void depth;
    }
    return out;
  }, [tree, collapsed]);

  async function runFilter(q: string) {
    setFilter(q);
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    try {
      setHits(await rpc<SearchHit[]>("search.query", { q }));
    } catch {
      setHits(null);
    }
  }

  return (
    <aside className="explorer">
      <div className="explorer-actions">
        <input
          className="filter"
          placeholder="Filter or search…"
          value={filter}
          onChange={(e) => void runFilter(e.target.value)}
        />
        <button title="New note" onClick={() => setDialog("templates")}>
          +
        </button>
        <button
          title="Add collection"
          onClick={() => setDialog("add-collection")}
        >
          ⌂
        </button>
      </div>

      {hits && (
        <div className="search-hits">
          <div className="section-label">Search results</div>
          {hits.length === 0 && <div className="muted">No matches.</div>}
          {hits.map((h) => (
            <button
              key={h.path}
              className="row hit"
              onClick={() => {
                void openNote(h.path, h.title);
                setHits(null);
                setFilter("");
              }}
            >
              {h.title}
              <span className="muted path">{h.path}</span>
            </button>
          ))}
        </div>
      )}

      <div className="tree">
        {visible.map((e) => {
          const indent = {
            paddingLeft: `${8 + (e.path.split("/").length - 1) * 14}px`,
          };
          if (e.kind === "dir") {
            const isCollapsed = collapsed.has(e.path);
            return (
              <button
                key={e.path}
                style={indent}
                className="row dir"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(e.path)) next.delete(e.path);
                    else next.add(e.path);
                    return next;
                  })}
              >
                <span className="chev">{isCollapsed ? "▸" : "▾"}</span> {e.name}
              </button>
            );
          }
          const isActive = activePath === e.path;
          const beginRename = () => {
            const next = window.prompt("Rename file", e.name)?.trim();
            if (!next || next === e.name) return;
            // Keep it a note: append .md when no extension was typed.
            const name = /\.[^/]+$/.test(next) ? next : `${next}.md`;
            const i = e.path.lastIndexOf("/");
            const to = i >= 0 ? `${e.path.slice(0, i + 1)}${name}` : name;
            void renameEntry(e.path, to).catch((err) => alert(msg(err)));
          };
          return (
            <div
              key={e.path}
              className={`row file ${isActive ? "active" : ""}`}
            >
              <button
                style={indent}
                className="file-open"
                onClick={() => void openNote(e.path)}
                onDoubleClick={beginRename}
              >
                {e.name.replace(/\.md$/, "")}
              </button>
              <button className="icon" title="Rename" onClick={beginRename}>
                ✎
              </button>
              <button
                className="icon danger"
                title="Delete"
                onClick={() => {
                  if (confirm(`Delete ${e.path}?`)) void deleteEntry(e.path);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="muted empty">
            No markdown files yet. Use + to create one.
          </div>
        )}
      </div>
    </aside>
  );
}
