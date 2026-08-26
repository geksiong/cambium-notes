import { useEffect, useState } from "react";
import {
  parseFrontMatterYaml,
  stringifyFrontMatterYaml,
} from "../../src-core/frontmatter.ts";
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

type FmTab = "form" | "yaml";

const YAML_PLACEHOLDER = "title: My note\ntags: [a, b]";

/**
 * Frontmatter editor rendered as a card at the top of the document. Two
 * modes behind a tab strip: structured form fields, or the raw YAML
 * fragment. Both commit into the store per keystroke; invalid YAML keeps
 * the last valid mapping on screen instead of clobbering the note.
 */
export function FrontmatterPanel() {
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const activePath = useStore((s) => s.activePath);
  const notes = useStore((s) => s.notes);
  const updateFrontMatter = useStore((s) => s.updateFrontMatter);

  const key = activeCollectionId && activePath
    ? `${activeCollectionId}:${activePath}`
    : null;
  const note = key ? notes[key] : undefined;

  const [tab, setTab] = useState<FmTab>("form");
  const [collapsed, setCollapsed] = useState(false);
  const [newKey, setNewKey] = useState("");

  // Local mirror so typing feels immediate; committed to store per keystroke.
  const [local, setLocal] = useState<FrontMatter>({});
  // Draft text for YAML mode, kept separate so invalid input never bounces.
  const [yamlText, setYamlText] = useState("");
  const [yamlError, setYamlError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(note?.fm ?? {});
    setYamlText(stringifyFrontMatterYaml(note?.fm ?? {}));
    setYamlError(null);
    setTab("form");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!note) return null;

  const commit = (next: FrontMatter) => {
    setLocal(next);
    if (activePath) updateFrontMatter(activePath, next);
  };

  const switchTab = (t: FmTab) => {
    if (t === "yaml") {
      setYamlText(stringifyFrontMatterYaml(local));
      setYamlError(null);
    }
    setTab(t);
  };

  const onYamlInput = (text: string) => {
    setYamlText(text);
    const parsed = parseFrontMatterYaml(text);
    if (parsed) {
      setYamlError(null);
      commit(parsed);
    } else {
      setYamlError("Invalid YAML — edits not applied.");
    }
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
    <div className={`fm-card ${collapsed ? "collapsed" : ""}`}>
      <div className="fm-head">
        <button
          className="fm-fold"
          title={collapsed ? "Expand" : "Collapse"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className="section-label">Frontmatter</span>
        <div className="fm-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "form"}
            className={tab === "form" ? "on" : ""}
            onClick={() => switchTab("form")}
          >
            Form
          </button>
          <button
            role="tab"
            aria-selected={tab === "yaml"}
            className={tab === "yaml" ? "on" : ""}
            onClick={() => switchTab("yaml")}
          >
            YAML
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="fm-body">
          {tab === "form"
            ? (
              <>
                {ordered.map(([k, v]) => (
                  <label key={k} className="fm-field">
                    <span>{k}</span>
                    {Array.isArray(v) || typeof v === "object" && v !== null
                      ? (
                        <input
                          value={JSON.stringify(v)}
                          onChange={(e) => {
                            try {
                              commit({
                                ...local,
                                [k]: JSON.parse(e.target.value),
                              });
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
                          onChange={(e) =>
                            commit({ ...local, draft: e.target.checked })}
                        />
                      )
                      : (
                        <input
                          value={String(v ?? "")}
                          onChange={(e) =>
                            commit({ ...local, [k]: e.target.value })}
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
              </>
            )
            : (
              <>
                <textarea
                  className="fm-yaml"
                  spellCheck={false}
                  value={yamlText}
                  placeholder={YAML_PLACEHOLDER}
                  onChange={(e) => onYamlInput(e.target.value)}
                />
                {yamlError && <div className="fm-error">{yamlError}</div>}
                {!yamlError && (
                  <div className="muted small">
                    Raw YAML between the --- fences; parses live as you type.
                  </div>
                )}
              </>
            )}
        </div>
      )}
    </div>
  );
}
