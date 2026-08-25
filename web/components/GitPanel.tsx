import { useCallback, useEffect, useState } from "react";
import type { GitCommitInfo, GitStatus } from "../../src-core/types.ts";
import { msg, useStore } from "../state/store.ts";
import { rpc } from "../transport.ts";

export function GitPanel() {
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const setStatus = useStore((s) => s.setStatus);
  const [status, setGitStatus] = useState<GitStatus | null>(null);
  const [log, setLog] = useState<GitCommitInfo[]>([]);
  const [message, setMessage] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeCollectionId) return;
    try {
      const st = await rpc<GitStatus>("git.status", {
        collectionId: activeCollectionId,
      });
      setGitStatus(st);
      setRemoteUrl(st.remoteUrl ?? "");
      if (st.isRepo) {
        setLog(
          await rpc<GitCommitInfo[]>("git.log", {
            collectionId: activeCollectionId,
          }),
        );
      }
    } catch (e) {
      setGitStatus(null);
      setStatus(`git: ${msg(e)}`);
    }
  }, [activeCollectionId, setStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(fn: () => Promise<unknown>, label: string) {
    if (!activeCollectionId) return;
    setBusy(true);
    try {
      await fn();
      setStatus(label);
    } catch (e) {
      alert(msg(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  if (!activeCollectionId) {
    return <div className="muted pad">No collection.</div>;
  }
  if (!status) return <div className="muted pad">Loading git status…</div>;

  return (
    <div className="git-panel">
      <div className="section-label">Git</div>
      {!status.isRepo
        ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void act(
                () => rpc("git.init", { collectionId: activeCollectionId }),
                "Repository initialised.",
              )}
          >
            Initialise repository
          </button>
        )
        : (
          <>
            <div className="muted small">
              branch <b>{status.branch ?? "(detached)"}</b>
            </div>

            <label className="field">
              <span>Remote origin</span>
              <input
                placeholder="https://github.com/user/repo.git"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
              />
            </label>
            <div className="row-actions">
              <button
                disabled={busy || !remoteUrl.trim()}
                onClick={() =>
                  void act(
                    () =>
                      rpc("git.connectRemote", {
                        collectionId: activeCollectionId,
                        url: remoteUrl,
                      }),
                    "Remote saved.",
                  )}
              >
                Save remote
              </button>
              <button
                disabled={busy || !status.remoteUrl}
                onClick={() =>
                  void act(
                    () => rpc("git.pull", { collectionId: activeCollectionId }),
                    "Pulled.",
                  )}
              >
                Pull
              </button>
              <button
                disabled={busy || !status.remoteUrl}
                onClick={() =>
                  void act(
                    () => rpc("git.push", { collectionId: activeCollectionId }),
                    "Pushed.",
                  )}
              >
                Push
              </button>
            </div>

            <div className="changes">
              {status.entries.length === 0 && (
                <div className="muted small">Working tree clean.</div>
              )}
              {status.entries.map((e) => (
                <div key={e.path} className="change-row">
                  <code className={`badge ${e.y === "?" ? "new" : ""}`}>
                    {`${e.x}${e.y}`.trim()}
                  </code>
                  {e.path}
                </div>
              ))}
            </div>

            <textarea
              rows={2}
              placeholder="Commit message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button
              className="primary"
              disabled={busy || !message.trim()}
              onClick={() =>
                void act(
                  async () => {
                    await rpc("git.commit", {
                      collectionId: activeCollectionId,
                      message,
                    });
                    setMessage("");
                  },
                  "Committed.",
                )}
            >
              Commit all changes
            </button>

            <div className="section-label">History</div>
            <div className="history">
              {log.map((c) => (
                <div key={c.hash} className="commit">
                  <code>{c.hash.slice(0, 7)}</code> {c.message}
                  <span className="muted small">
                    {" "}
                    · {c.author} · {ago(c.time)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
    </div>
  );
}

function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
