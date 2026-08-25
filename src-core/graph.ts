import { resolveLink, slugify } from "./links.ts";
import type { GraphData, GraphEdge, GraphNode, NoteRef } from "./types.ts";

export interface GraphOptions {
  /** Include unresolved link targets as ghost nodes. */
  ghosts?: boolean;
  scopeCollectionId?: string;
}

export function buildGraph(
  notes: NoteRef[],
  opts: GraphOptions = {},
): GraphData {
  const scoped = opts.scopeCollectionId
    ? notes.filter((n) => n.collectionId === opts.scopeCollectionId)
    : notes;

  const nodes = new Map<string, GraphNode>();
  for (const n of scoped) {
    nodes.set(n.path, {
      id: n.path,
      label: n.title,
      collectionId: n.collectionId,
      degree: 0,
      tags: n.tags,
    });
  }

  const allPaths = scoped.map((n) => n.path);
  const edgeKey = new Set<string>();
  const edges: GraphEdge[] = [];

  const addEdge = (a: string, b: string) => {
    if (a === b) return;
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    if (edgeKey.has(key)) return;
    edgeKey.add(key);
    edges.push({ source: a, target: b });
  };

  for (const n of scoped) {
    for (const raw of n.links) {
      const resolved = resolveLink(raw, allPaths);
      if (resolved) {
        addEdge(n.path, resolved);
      } else if (opts.ghosts) {
        const ghostId = ghostIdFor(raw);
        if (!nodes.has(ghostId)) {
          nodes.set(ghostId, {
            id: ghostId,
            label: raw,
            collectionId: n.collectionId,
            degree: 0,
            tags: [],
          });
        }
        addEdge(n.path, ghostId);
      }
    }
  }

  for (const e of edges) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (s) s.degree++;
    if (t) t.degree++;
  }

  return { nodes: [...nodes.values()], edges };
}

export function ghostIdFor(target: string): string {
  return `ghost:${slugify(target)}`;
}
