import { useEffect, useMemo, useRef, useState } from "react";
import { collectVars } from "../../src-core/templates.ts";
import { msg, useStore } from "../state/store.ts";
import { rpc } from "../transport.ts";

interface TemplateInfo {
  id: string;
  label: string;
  content: string;
  readonly?: boolean;
}

const BUILTIN_VARS = new Set(["title", "date", "time", "id", "author"]);

export function TemplateManagerDialog() {
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const setDialog = useStore((s) => s.setDialog);
  const setStatus = useStore((s) => s.setStatus);

  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [fileName, setFileName] = useState("");
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const listEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void rpc<TemplateInfo[]>("templates.list", {
      collectionId: activeCollectionId ?? undefined,
    }).then((t) => {
      setTemplates(t);
      const users = t.filter((x) => !x.readonly);
      if (!t.some((x) => x.id === selectedId)) {
        const first = users[0] ?? t[0] ?? null;
        select(first);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollectionId]);

  const userTemplates = templates.filter((t) => !t.readonly);
  const presetTemplates = templates.filter((t) => t.readonly);
  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const editingPreset = !!selected?.readonly;

  const extraVarNames = useMemo(
    () => (draft ? collectVars(draft).filter((v) => !BUILTIN_VARS.has(v)) : []),
    [draft],
  );

  if (!activeCollectionId) {
    return (
      <div className="modal-backdrop" onClick={() => setDialog(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Templates</h3>
          <p className="muted">
            No collection selected. Add a folder of markdown notes first.
          </p>
          <div className="row-actions end">
            <button onClick={() => setDialog(null)}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  function select(t: TemplateInfo | null) {
    if (!t) {
      setSelectedId(null);
      setIsNew(true);
      setFileName("");
      setDraft("");
      setSaved(false);
      setError("");
      return;
    }
    setSelectedId(t.id);
    setIsNew(false);
    setFileName(t.id.replace("user:", ""));
    setDraft(t.content);
    setSaved(false);
    setError("");
  }

  function pick(id: string) {
    select(templates.find((t) => t.id === id) ?? null);
    if (listEl.current) {
      listEl.current.querySelector<HTMLElement>(`[data-id="${id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }

  function startNew() {
    select(null);
  }

  async function save() {
    setError("");
    // Built-in presets are immutable in code, so saving always creates a new
    // user template. The user must supply a different filename.
    const name = fileName.trim();
    if (!name) {
      setError("Choose a filename before saving.");
      return;
    }
    const extName = name.endsWith(".md") ? name : `${name}.md`;
    try {
      if (isNew || editingPreset || !selectedId) {
        const created = await rpc<TemplateInfo>("templates.create", {
          collectionId: activeCollectionId,
          name: extName,
          content: draft,
        });
        setTemplates((ts) => [...ts, created]);
        setSelectedId(created.id);
        setIsNew(false);
        setFileName(created.id.replace("user:", ""));
        setStatus(`Created template ${created.label}`);
      } else {
        const updated = await rpc<TemplateInfo>("templates.save", {
          collectionId: activeCollectionId,
          id: selectedId,
          content: draft,
        });
        setTemplates((ts) =>
          ts.map((u) => (u.id === updated.id ? updated : u))
        );
        setFileName(updated.id.replace("user:", ""));
        setStatus(`Saved template ${updated.label}`);
      }
      setSaved(true);
    } catch (e) {
      setError(msg(e));
    }
  }

  async function remove() {
    if (!selectedId) return;
    setError("");
    try {
      await rpc("templates.delete", {
        collectionId: activeCollectionId,
        id: selectedId,
      });
      const list = templates.filter((t) => t.id !== selectedId);
      setTemplates(list);
      const next = list.find((t) => !t.readonly) ?? null;
      select(next);
      setStatus("Deleted template");
    } catch (e) {
      setError(msg(e));
    }
  }

  function renderListButton(t: TemplateInfo) {
    return (
      <button
        key={t.id}
        data-id={t.id}
        className={selectedId === t.id ? "on" : ""}
        onClick={() => pick(t.id)}
      >
        {t.label}
      </button>
    );
  }

  return (
    <div className="modal-backdrop" onClick={() => setDialog(null)}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Templates</h3>
        <p className="muted small">
          Collection templates are plain markdown files in{" "}
          <code>.cambium/templates/*.md</code>. Use{" "}
          <code>{"{{title}} {{date}} {{time}} {{id}} {{author}}"}</code>{" "}
          plus any custom variables.
        </p>

        <div className="tm-app">
          <div className="tm-list" ref={listEl}>
            <div className="section-label">Collection</div>
            {userTemplates.length === 0 && (
              <div className="muted small">None yet — create one below.</div>
            )}
            {userTemplates.map(renderListButton)}
            {presetTemplates.length > 0 && (
              <div className="section-label">Presets</div>
            )}
            {presetTemplates.map(renderListButton)}
            <button className="tm-new-button" onClick={startNew}>
              + New template
            </button>
          </div>

          <div className="tm-editor">
            {editingPreset && (
              <div className="muted small">
                Preset templates are read-only. Saving below creates a new
                collection template under a different filename.
              </div>
            )}
            <label className="field">
              <span>
                {editingPreset ? "New filename (.md)" : "Filename (.md)"}
              </span>
              <input
                ref={fileInput}
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value);
                  setSaved(false);
                }}
                placeholder="my-template"
                readOnly={!!selected && !editingPreset && !isNew}
              />
            </label>

            <div className="tm-head">
              {extraVarNames.length > 0 && (
                <span className="muted small">
                  vars: {extraVarNames.join(", ")}
                </span>
              )}
              {saved && <span className="badge new">saved</span>}
            </div>

            <textarea
              className="tm-textarea"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
              spellCheck={false}
            />

            <div className="row-actions">
              {selected && !selected.readonly && !isNew && (
                <button
                  className="danger"
                  onClick={() => void remove()}
                >
                  Delete
                </button>
              )}
              <div className="spacer" />
              <button onClick={() => setDialog(null)}>Close</button>
              <button className="primary" onClick={() => void save()}>
                {editingPreset ? "Save as new…" : "Save"}
              </button>
            </div>
          </div>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
