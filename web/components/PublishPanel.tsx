import { useCallback, useEffect, useState } from "react";
import type { PublishProfile } from "../../src-core/types.ts";
import { msg, useStore } from "../state/store.ts";
import { rpc } from "../transport.ts";

interface PublishStatus {
  profile: PublishProfile | null;
  siteDir: string;
  siteExists: boolean;
}

export function PublishPanel() {
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const setStatus = useStore((s) => s.setStatus);
  const [st, setSt] = useState<PublishStatus | null>(null);
  const [target, setTarget] = useState<"github-pages" | "netlify">(
    "github-pages",
  );
  const [repoUrl, setRepoUrl] = useState("");
  const [netlifySite, setNetlifySite] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeCollectionId) return;
    try {
      const s = await rpc<PublishStatus>("publish.status", {
        collectionId: activeCollectionId,
      });
      setSt(s);
      if (s.profile) {
        setTarget(s.profile.target);
        setRepoUrl(s.profile.repoUrl ?? "");
        setNetlifySite(s.profile.netlifySite ?? "");
        setIncludeDrafts(s.profile.includeDrafts ?? false);
      }
    } catch (e) {
      setStatus(msg(e));
    }
  }, [activeCollectionId, setStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Menu-driven actions (Publish menu).
  useEffect(() => {
    const h = (e: Event) => {
      const action = (e as CustomEvent<{ id: string }>).detail.id;
      useStore.getState().setPanel("publish");
      if (action === "pub-sync") void doRun("publish.sync", "Synced.");
      if (action === "pub-build") void doRun("publish.build", "Built.");
      if (action === "pub-deploy") void doRun("publish.deploy", "Deployed.");
    };
    window.addEventListener("cambium:menu", h);
    return () => window.removeEventListener("cambium:menu", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollectionId]);

  async function save() {
    if (!activeCollectionId) return;
    await rpc("publish.saveProfile", {
      collectionId: activeCollectionId,
      profile: {
        enabled: true,
        target,
        repoUrl,
        netlifySite,
        includeDrafts,
      },
    });
    await refresh();
    setStatus("Publish profile saved.");
  }

  async function doRun(method: string, okLabel: string) {
    if (!activeCollectionId || busy) return;
    setBusy(true);
    setLog((l) => `${l}\n$ ${method}\n`);
    try {
      const res = await rpc<Record<string, unknown>>(method, {
        collectionId: activeCollectionId,
      });
      setLog((l) =>
        `${l}${
          typeof res === "object" ? JSON.stringify(res, null, 2) : String(res)
        }\n`
      );
      setStatus(okLabel);
    } catch (e) {
      setLog((l) => `${l}ERROR: ${msg(e)}\n`);
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  if (!activeCollectionId || !st) {
    return <div className="muted pad">No collection selected.</div>;
  }

  return (
    <div className="publish-panel">
      <div className="section-label">Publishing (Astro)</div>
      <div className="muted small">{st.siteDir}</div>

      {!st.siteExists && (
        <button
          onClick={() =>
            void doRun("publish.createSite", "Astro starter scaffolded.")}
        >
          Create Astro site
        </button>
      )}

      <label className="field">
        <span>Target</span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as typeof target)}
        >
          <option value="github-pages">GitHub Pages</option>
          <option value="netlify">Netlify</option>
        </select>
      </label>
      {target === "github-pages"
        ? (
          <label className="field">
            <span>Repository URL</span>
            <input
              placeholder="https://github.com/user/repo.git"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </label>
        )
        : (
          <label className="field">
            <span>Netlify site id (optional)</span>
            <input
              value={netlifySite}
              onChange={(e) => setNetlifySite(e.target.value)}
            />
          </label>
        )}
      <label className="check">
        <input
          type="checkbox"
          checked={includeDrafts}
          onChange={(e) => setIncludeDrafts(e.target.checked)}
        />
        publish drafts
      </label>
      <button onClick={() => void save()}>Save profile</button>

      <div className="row-actions">
        <button
          disabled={busy}
          onClick={() => void doRun("publish.sync", "Synced.")}
        >
          Sync notes
        </button>
        <button
          disabled={busy}
          onClick={() => void doRun("publish.build", "Built.")}
        >
          Build
        </button>
        <button
          className="primary"
          disabled={busy || !st.siteExists}
          onClick={() => void doRun("publish.deploy", "Deployed.")}
        >
          Deploy
        </button>
      </div>

      {log && <pre className="log">{log}</pre>}
      <div className="muted small">
        Pipeline: sync → normalised content collection → build via detected
        package manager → deploy. GitHub auth uses your git credential helper;
        Netlify uses the netlify CLI.
      </div>
    </div>
  );
}
