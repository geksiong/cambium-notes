import { useEffect, useState } from "react";
import type { AiProviderConfig } from "../../src-core/types.ts";
import { msg, useStore } from "../state/store.ts";
import { rpc } from "../transport.ts";

export function SettingsDialog() {
  const setDialog = useStore((s) => s.setDialog);
  const refreshCollections = useStore((s) => s.refreshCollections);
  const themePref = useStore((s) => s.themePref);
  const setTheme = useStore((s) => s.setTheme);

  const [author, setAuthor] = useState("");
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void rpc<{ authorName: string; aiProviders: AiProviderConfig[] }>(
      "settings.get",
    ).then((s) => {
      setAuthor(s.authorName);
      setProviders(s.aiProviders ?? []);
    });
  }, []);

  function patchProvider(i: number, patch: Partial<AiProviderConfig>) {
    setProviders((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  async function save() {
    setError("");
    try {
      await rpc("settings.updateAuthor", { authorName: author });
      for (const p of providers) {
        await rpc("settings.upsertProvider", { ...p, id: p.id || undefined });
      }
      await refreshCollections();
      setDialog(null);
    } catch (e) {
      setError(msg(e));
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setDialog(null)}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <label className="field">
          <span>Author name</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>

        <div className="section-label">Appearance</div>
        <div className="row-actions">
          {(["light", "dark", "auto"] as const).map((t) => (
            <button
              key={t}
              className={themePref === t ? "on" : ""}
              onClick={() => void setTheme(t)}
            >
              {{ light: "Light", dark: "Dark", auto: "Auto" }[t]}
            </button>
          ))}
        </div>
        <div className="muted small">Auto follows the operating system.</div>

        <div className="section-label">AI providers</div>
        {providers.map((p, i) => (
          <div key={i} className="provider-card">
            <div className="row-actions">
              <input
                className="grow"
                placeholder="name"
                value={p.name}
                onChange={(e) => patchProvider(i, { name: e.target.value })}
              />
              <select
                value={p.type}
                onChange={(e) =>
                  patchProvider(i, {
                    type: e.target.value as AiProviderConfig["type"],
                  })}
              >
                <option value="openai-compatible">OpenAI-compatible</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama</option>
              </select>
              <button
                className="danger"
                onClick={() => {
                  setProviders((ps) => ps.filter((_, j) => j !== i));
                  if (p.id) void rpc("settings.removeProvider", { id: p.id });
                }}
              >
                ×
              </button>
            </div>
            <input
              placeholder="base URL"
              value={p.baseUrl}
              onChange={(e) => patchProvider(i, { baseUrl: e.target.value })}
            />
            <div className="row-actions">
              <input
                className="grow"
                placeholder="model"
                value={p.model}
                onChange={(e) => patchProvider(i, { model: e.target.value })}
              />
              <input
                type="password"
                placeholder="API key (stored locally)"
                value={p.apiKey ?? ""}
                onChange={(e) => patchProvider(i, { apiKey: e.target.value })}
              />
            </div>
          </div>
        ))}
        <button
          onClick={() =>
            setProviders((ps) => [
              ...ps,
              {
                id: "",
                name: "New provider",
                type: "openai-compatible",
                baseUrl: "https://api.openai.com/v1",
                model: "gpt-4o-mini",
                apiKey: "",
              },
            ])}
        >
          + Add provider
        </button>

        <div className="muted small">
          API keys are stored in local settings for now; OS keychain support is
          on the roadmap. Requests go directly from this machine to the
          provider.
        </div>

        {error && <div className="error">{error}</div>}
        <div className="row-actions end">
          <button onClick={() => setDialog(null)}>Cancel</button>
          <button className="primary" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddCollectionDialog() {
  const setDialog = useStore((s) => s.setDialog);
  const refreshCollections = useStore((s) => s.refreshCollections);
  const setActiveCollection = useStore((s) => s.setActiveCollection);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function add() {
    setError("");
    try {
      const cfg = await rpc<{ id: string }>("collections.add", { path, name });
      await refreshCollections();
      await setActiveCollection(cfg.id);
      setDialog(null);
    } catch (e) {
      setError(msg(e));
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setDialog(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add collection</h3>
        <p className="muted small">
          A collection is a folder of markdown files. Native folder pickers are
          not yet available in deno desktop — paste an absolute path.
        </p>
        <label className="field">
          <span>Folder path</span>
          <input
            autoFocus
            placeholder="/home/you/notes"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Display name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="row-actions end">
          <button onClick={() => setDialog(null)}>Cancel</button>
          <button className="primary" onClick={() => void add()}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
