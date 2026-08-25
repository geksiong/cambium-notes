import { useEffect, useState } from "react";
import { AiPanel } from "./components/AiPanel.tsx";
import { EditorPane } from "./components/EditorPane.tsx";
import { Explorer } from "./components/Explorer.tsx";
import { FrontmatterPanel } from "./components/FrontmatterPanel.tsx";
import { GraphView } from "./components/GraphView.tsx";
import { GitPanel } from "./components/GitPanel.tsx";
import { PublishPanel } from "./components/PublishPanel.tsx";
import { TemplatesDialog } from "./components/TemplatesDialog.tsx";
import {
  AddCollectionDialog,
  SettingsDialog,
} from "./components/SettingsDialog.tsx";
import { editorRef, useStore } from "./state/store.ts";

export function App() {
  const collections = useStore((s) => s.collections);
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const setActiveCollection = useStore((s) => s.setActiveCollection);
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const dirty = useStore((s) => s.dirty);
  const activeCollectionIdRef = activeCollectionId;
  const setActiveTab = useStore((s) => s.setActive);
  const closeTab = useStore((s) => s.closeTab);
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const dialog = useStore((s) => s.dialog);
  const setDialog = useStore((s) => s.setDialog);
  const status = useStore((s) => s.status);
  const version = useStore((s) => s.version);

  // Graph is rendered as a full-area overlay (see GraphOverlay).
  useEffect(() => {
    void useStore.getState().bootstrap();

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void useStore.getState().save();
      }
    };
    window.addEventListener("keydown", onKey);

    // index-changed → refresh tree lazily
    const onIndex = () => void useStore.getState().loadTree();
    window.addEventListener("cambium:index-changed", onIndex);

    // native menu events
    const onMenu = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      const st = useStore.getState();
      switch (id) {
        case "new-note":
        case "new-template":
          st.setDialog("templates");
          break;
        case "save":
          void st.save();
          break;
        case "add-collection":
          st.setDialog("add-collection");
          break;
        case "open-settings":
          st.setDialog("settings");
          break;
        case "view-graph":
          window.dispatchEvent(new CustomEvent("cambium:toggle-graph"));
          break;
        case "view-git":
          st.setPanel(st.panel === "git" ? null : "git");
          break;
        case "view-ai":
          st.setPanel(st.panel === "ai" ? null : "ai");
          break;
        case "view-publish":
          st.setPanel("publish");
          break;
        case "reload-index":
          void st.loadTree().then(() => st.setStatus("Index refreshed."));
          break;
      }
    };
    window.addEventListener("cambium:menu", onMenu);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cambium:index-changed", onIndex);
      window.removeEventListener("cambium:menu", onMenu);
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="logo">Cambium</span>
        <select
          className="collection-select"
          value={activeCollectionId ?? ""}
          onChange={(e) => void setActiveCollection(e.target.value)}
        >
          {!collections.length && <option value="">No collections</option>}
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.noteCount})
            </option>
          ))}
        </select>
        <button onClick={() => setDialog("templates")}>New</button>
        <button
          onClick={() =>
            window.dispatchEvent(new CustomEvent("cambium:toggle-graph"))}
        >
          Graph
        </button>
        <div className="spacer" />
        <div className="panel-switch">
          {(["frontmatter", "ai", "git", "publish"] as const).map((p) => (
            <button
              key={p}
              className={panel === p ? "on" : ""}
              onClick={() => setPanel(panel === p ? null : p)}
            >
              {{
                frontmatter: "Info",
                ai: "AI",
                git: "Git",
                publish: "Publish",
              }[p]}
            </button>
          ))}
          <button onClick={() => setDialog("settings")} title="Settings">
            ⚙
          </button>
        </div>
      </header>

      <Explorer />

      <main className="main-area">
        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.path}
              className={`tab ${activePath === t.path ? "on" : ""}`}
              onClick={() => setActiveTab(t.path)}
            >
              {dirty.has(`${activeCollectionIdRef}:${t.path}`) ? "• " : ""}
              {t.title}
              <span
                className="close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.path);
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <EditorPane />
      </main>

      {panel && (
        <aside className="right-panel">
          {panel === "frontmatter" && <FrontmatterPanel />}
          {panel === "ai" && <AiPanel />}
          {panel === "git" && <GitPanel />}
          {panel === "publish" && <PublishPanel />}
        </aside>
      )}

      <footer className="statusbar">
        <DebugStrip />
        <span>{status}</span>
        <span className="muted">
          Cambium v{version} · build{" "}
          {__CAMBIUM_BUILD__.slice(0, 16).replace("T", " ")}
        </span>
      </footer>

      {dialog === "templates" && <TemplatesDialog />}
      {dialog === "settings" && <SettingsDialog />}
      {dialog === "add-collection" && <AddCollectionDialog />}
      <GraphOverlay />
    </div>
  );
}

/**
 * Graph overlay: toggled by the header button / View menu. Rendered as a
 * full-area overlay above the editor.
 */
/**
 * Live telemetry strip: reports internal state so rendering problems are
 * diagnosable from the status bar alone. Remove once stable.
 */
function DebugStrip() {
  const [s, setS] = useState("");
  useEffect(() => {
    const tick = () => {
      const st = useStore.getState();
      setS(
        `col:${st.activeCollectionId ?? "none"} ` +
          `tree:${st.tree.length} ` +
          `tabs:${st.tabs.length} ` +
          `open:${st.activePath ?? "-"} ` +
          `editor:${editorRef.current ? "mounted" : "no"} ·`,
      );
    };
    tick();
    const t = setInterval(tick, 400);
    return () => clearInterval(t);
  }, []);
  return <span className="debug-strip">{s}</span>;
}

function GraphOverlay() {
  const open = useStore((s) => s.graphOpen);
  const setOpen = (v: boolean) => useStore.setState({ graphOpen: v });

  useEffect(() => {
    const h = () => setOpen(!useStore.getState().graphOpen);
    window.addEventListener("cambium:toggle-graph", h);
    return () => window.removeEventListener("cambium:toggle-graph", h);
  }, []);

  if (!open) return null;
  return (
    <div className="graph-overlay">
      <div className="overlay-head">
        <b>Knowledge graph</b>
        <button onClick={() => setOpen(false)}>Close</button>
      </div>
      <GraphView />
    </div>
  );
}
