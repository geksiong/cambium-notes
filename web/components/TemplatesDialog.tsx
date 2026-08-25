import { useEffect, useMemo, useState } from "react";
import { collectVars } from "../../src-core/templates.ts";
import { msg, useStore } from "../state/store.ts";
import { rpc } from "../transport.ts";

interface TemplateInfo {
  id: string;
  label: string;
  content: string;
}

const BUILTIN_VARS = new Set(["title", "date", "time", "id", "author"]);

export function TemplatesDialog() {
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const tree = useStore((s) => s.tree);
  const createNote = useStore((s) => s.createNote);
  const setDialog = useStore((s) => s.setDialog);

  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [selected, setSelected] = useState<string>("builtin:zettel");
  const [title, setTitle] = useState("Untitled note");
  const [folder, setFolder] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const dirs = useMemo(
    () => tree.filter((e) => e.kind === "dir").map((e) => e.path),
    [tree],
  );

  useEffect(() => {
    void rpc<TemplateInfo[]>("templates.list", {
      collectionId: activeCollectionId ?? undefined,
    }).then((t) => {
      setTemplates(t);
      if (t.length && !t.some((x) => x.id === selected)) setSelected(t[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollectionId]);

  const current = templates.find((t) => t.id === selected);
  const extraVarNames = current
    ? collectVars(current.content).filter((v) => !BUILTIN_VARS.has(v))
    : [];

  async function create() {
    setError("");
    try {
      await createNote({
        folder,
        title,
        templateId: selected,
        extraVars: vars,
      });
    } catch (e) {
      setError(msg(e));
    }
  }

  if (!activeCollectionId) {
    return (
      <div className="modal-backdrop" onClick={() => setDialog(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>New note</h3>
          <p className="muted">
            No collection selected. Add a folder of markdown notes first.
          </p>
          <div className="row-actions end">
            <button onClick={() => setDialog(null)}>Cancel</button>
            <button
              className="primary"
              onClick={() => setDialog("add-collection")}
            >
              Add collection…
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={() => setDialog(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New note</h3>
        <label className="field">
          <span>Template</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Folder</span>
          <input
            list="folders"
            placeholder="(collection root)"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          />
          <datalist id="folders">
            {dirs.map((d) => <option key={d} value={d} />)}
          </datalist>
        </label>
        {extraVarNames.map((v) => (
          <label key={v} className="field">
            <span>{v}</span>
            <input
              value={vars[v] ?? ""}
              onChange={(e) => setVars({ ...vars, [v]: e.target.value })}
            />
          </label>
        ))}
        {error && <div className="error">{error}</div>}
        <div className="row-actions end">
          <button onClick={() => setDialog(null)}>Cancel</button>
          <button className="primary" onClick={() => void create()}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
