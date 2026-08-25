import { useEffect, useState } from "react";
import type { FrontMatter } from "../../src-core/types.ts";
import { useStore } from "../state/store.ts";

const COMMON_FIELDS = [
  "title",
  "description",
  "date",
  "tags",
  "slug",
  "draft",
] as const;

export function FrontmatterPanel() {
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const activePath = useStore((s) => s.activePath);
  const notes = useStore((s) => s.notes);
  const updateFrontMatter = useStore((s) => s.updateFrontMatter);

  const key = activeCollectionId && activePath
    ? `${activeCollectionId}:${activePath}`
    : null;
  const note = key ? notes[key] : undefined;

  const [newKey, setNewKey] = useState("");

  // Local mirror so typing feels immediate; committed to store per keystroke.
  const [local, setLocal] = useState<FrontMatter>({});
  useEffect(() => {
    setLocal(note?.fm ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!note) return <div className="muted pad">No note open.</div>;

  const commit = (next: FrontMatter) => {
    setLocal(next);
    if (activePath) updateFrontMatter(activePath, next);
  };

  const ordered: [string, unknown][] = [];
  for (const f of COMMON_FIELDS) {
    if (f in local) ordered.push([f, local[f]]);
  }
  for (const k of Object.keys(local)) {
    if (!(COMMON_FIELDS as readonly string[]).includes(k)) {
      ordered.push([k, local[k]]);
    }
  }

  return (
    <div className="fm-panel">
      <div className="section-label">Frontmatter</div>
      {ordered.map(([k, v]) => (
        <label key={k} className="fm-field">
          <span>{k}</span>
          {Array.isArray(v) || typeof v === "object" && v !== null
            ? (
              <input
                value={JSON.stringify(v)}
                onChange={(e) => {
                  try {
                    commit({ ...local, [k]: JSON.parse(e.target.value) });
                  } catch {
                    /* keep last valid */
                  }
                }}
              />
            )
            : k === "draft"
            ? (
              <input
                type="checkbox"
                checked={v === true}
                onChange={(e) => commit({ ...local, draft: e.target.checked })}
              />
            )
            : (
              <input
                value={String(v ?? "")}
                onChange={(e) => commit({ ...local, [k]: e.target.value })}
              />
            )}
        </label>
      ))}
      <form
        className="fm-add"
        onSubmit={(e) => {
          e.preventDefault();
          const k = newKey.trim();
          if (k && !(k in local)) commit({ ...local, [k]: "" });
          setNewKey("");
        }}
      >
        <input
          placeholder="add field…"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <button type="submit">+</button>
      </form>
      <div className="muted small">
        Saved into the YAML header on write; body is untouched.
      </div>
    </div>
  );
}
