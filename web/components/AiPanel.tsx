import { useEffect, useState } from "react";
import type { AiCommandId } from "../../src-core/ai/commands.ts";
import { editorRef, msg, useStore } from "../state/store.ts";
import { aiStream, rpc } from "../transport.ts";

interface CommandInfo {
  id: string;
  label: string;
  description: string;
}
interface ProviderInfo {
  id: string;
  name: string;
  model: string;
}

export function AiPanel() {
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const activePath = useStore((s) => s.activePath);
  const notes = useStore((s) => s.notes);
  const setStatus = useStore((s) => s.setStatus);

  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState("");
  const [commandId, setCommandId] = useState<AiCommandId>("summarize");
  const [useBacklinks, setUseBacklinks] = useState(false);
  const [promptOverride, setPromptOverride] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [output, setOutput] = useState("");
  const [echoedPrompt, setEchoedPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void rpc<CommandInfo[]>("ai.commands").then(setCommands).catch(() =>
      undefined
    );
    void rpc<ProviderInfo[]>("ai.providers")
      .then((p) => {
        setProviders(p);
        if (p[0]) setProviderId(p[0].id);
      })
      .catch(() => undefined);
  }, []);

  // Menu items preset the command.
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id.replace(
        "ai-",
        "",
      );
      setCommandId(id as AiCommandId);
      useStore.getState().setPanel("ai");
    };
    window.addEventListener("cambium:menu", h);
    return () => window.removeEventListener("cambium:menu", h);
  }, []);

  const note = activeCollectionId && activePath
    ? notes[`${activeCollectionId}:${activePath}`]
    : undefined;

  async function run() {
    if (!providerId || !note || !activePath || !activeCollectionId) return;
    let selection: string | undefined;
    const ed = editorRef.current;
    if (ed && !ed.state.selection.empty) {
      const { from, to } = ed.state.selection;
      selection = ed.state.doc.textBetween(from, to, "\n");
    }
    let backlinks: { title: string; excerpt: string }[] | undefined;
    if (useBacklinks) {
      backlinks = await rpc("ai.backlinks", {
        collectionId: activeCollectionId,
        path: activePath,
      });
    }
    setBusy(true);
    setOutput("");
    try {
      await aiStream(
        {
          providerId,
          commandId,
          promptOverride: promptOverride.trim() || undefined,
          context: {
            title: note.fm.title ?? activePath,
            frontMatterYaml: Object.keys(note.fm).length
              ? JSON.stringify(note.fm, null, 0)
              : "",
            body: note.body,
            selection,
            backlinks,
          },
        },
        {
          onEcho: (p) => setEchoedPrompt(p),
          onDelta: (d) => setOutput((o) => o + d),
        },
      );
    } catch (e) {
      setOutput(`Error: ${msg(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function insertAtCursor() {
    const ed = editorRef.current;
    if (ed && output) {
      ed.chain().focus().insertContent(output).run();
      setStatus("AI text inserted at cursor.");
    }
  }

  function replaceBody() {
    if (!activePath || !output) return;
    useStore.getState().updateBody(activePath, output);
    setStatus("Note body replaced by AI output.");
  }

  return (
    <div className="ai-panel">
      <div className="section-label">AI assistant</div>
      {!providers.length && (
        <div className="muted small">
          No providers configured. Add one in Settings → AI Providers.
        </div>
      )}
      <label className="field">
        <span>Provider</span>
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.model})
            </option>
          ))}
        </select>
      </label>

      <div className="chips">
        {commands.map((c) => (
          <button
            key={c.id}
            title={c.description}
            className={`chip ${commandId === c.id ? "on" : ""}`}
            onClick={() => setCommandId(c.id as AiCommandId)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={useBacklinks}
          onChange={(e) => setUseBacklinks(e.target.checked)}
        />
        include linking notes as context
      </label>

      <button
        className="primary"
        disabled={busy || !note || !providerId}
        onClick={() => void run()}
      >
        {busy ? "Running…" : "Run"}
      </button>
      <button className="link" onClick={() => setShowPrompt((v) => !v)}>
        {showPrompt ? "hide prompt editor" : "edit prompt before sending"}
      </button>
      {showPrompt && (
        <textarea
          rows={6}
          placeholder="Leave empty to use the command's built-in prompt."
          value={promptOverride}
          onChange={(e) => setPromptOverride(e.target.value)}
        />
      )}

      {echoedPrompt && showPrompt && (
        <details>
          <summary className="muted small">effective prompt</summary>
          <pre className="log">{echoedPrompt}</pre>
        </details>
      )}

      {output && (
        <>
          <div className="section-label">Result</div>
          <pre className="ai-output">{output}</pre>
          <div className="row-actions">
            <button onClick={insertAtCursor}>Insert at cursor</button>
            <button onClick={replaceBody}>Replace note body</button>
            <button
              className="link"
              onClick={() => navigator.clipboard?.writeText(output)}
            >
              copy
            </button>
          </div>
        </>
      )}
    </div>
  );
}
