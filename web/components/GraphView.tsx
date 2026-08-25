import GraphPkg from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import SigmaPkg from "sigma";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.ts";

// The npm typings for these graph libs are loose; narrow them locally.
const Graph = GraphPkg as unknown as new () => GraphInstance;
const fa2 = forceAtlas2 as unknown as {
  assign(graph: GraphInstance, o: Record<string, unknown>): void;
};

interface GraphInstance {
  order: number;
  addNode(id: string, attrs: Record<string, unknown>): void;
  hasNode(id: string): boolean;
  hasEdge(a: string, b: string): boolean;
  addEdge(a: string, b: string, attrs?: Record<string, unknown>): void;
  forEachNode(cb: (id: string, attrs: Record<string, unknown>) => void): void;
}

interface SigmaInstance {
  kill(): void;
  on(ev: string, fn: (p: { node: string }) => void): void;
}

const Sigma = SigmaPkg as unknown as new (
  graph: GraphInstance,
  container: HTMLElement,
  opts?: Record<string, unknown>,
) => SigmaInstance;

// Per-collection node colors — mid-saturation hues chosen to read on both
// light and dark backgrounds.
const PALETTE = [
  "#4f9cf9",
  "#9d7bf5",
  "#48b8a0",
  "#e2a54a",
  "#e26d6d",
  "#67c95d",
];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export function GraphView() {
  const graphData = useStore((s) => s.graph);
  const collections = useStore((s) => s.collections);
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const loadGraph = useStore((s) => s.loadGraph);
  const openNote = useStore((s) => s.openNote);

  const [scope, setScope] = useState<"all" | "current">("all");
  const [themeTick, setThemeTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<SigmaInstance | null>(null);
  // Node positions survive rebuilds (e.g. theme switches) so the layout
  // doesn't reshuffle while the overlay is open.
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    void loadGraph(
      scope === "current" ? (activeCollectionId ?? undefined) : undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, activeCollectionId]);

  useEffect(() => {
    const bump = () => setThemeTick((t) => t + 1);
    window.addEventListener("cambium:theme-changed", bump);
    return () => window.removeEventListener("cambium:theme-changed", bump);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !graphData) return;

    const g = new Graph();
    for (const n of graphData.nodes) {
      const prev = positionsRef.current[n.id];
      const pos = prev ?? { x: Math.random(), y: Math.random() };
      g.addNode(n.id, {
        label: n.label,
        size: 4 + Math.min(14, n.degree * 1.6),
        color: n.id.startsWith("ghost:")
          ? cssVar("--fg-dim")
          : colorFor(n.collectionId),
        x: pos.x,
        y: pos.y,
      });
    }
    for (const e of graphData.edges) {
      if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
      if (!g.hasEdge(e.source, e.target)) {
        g.addEdge(e.source, e.target, { size: 1 });
      }
    }

    if (g.order > 0) {
      const iterations = Math.min(300, 80 + g.order * 3);
      for (let i = 0; i < iterations; i++) {
        fa2.assign(g, {
          iterations: 1,
          settings: {
            gravity: 1.2,
            scalingRatio: 12,
            barnesHutOptimize: g.order > 500,
            strongGravityMode: false,
            slowDown: 4,
          },
        });
      }
    }

    const sigma = new Sigma(g, el, {
      renderEdgeLabels: false,
      allowInvalidContainer: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 10,
      defaultEdgeColor: cssVar("--border"),
      labelDensity: 0.6,
      labelGridCellSize: 90,
    });
    sigma.on("clickNode", ({ node }) => {
      if (!node.startsWith("ghost:")) void openNote(node);
    });
    sigmaRef.current = sigma;

    return () => {
      positionsRef.current = {};
      g.forEachNode((id, attrs) => {
        positionsRef.current[id] = {
          x: attrs.x as number,
          y: attrs.y as number,
        };
      });
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [graphData, openNote, themeTick]);

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "all" | "current")}
        >
          <option value="all">All collections</option>
          <option value="current">Current collection</option>
        </select>
        <span className="muted">
          {graphData?.nodes.length ?? 0} notes · {graphData?.edges.length ?? 0}
          {" "}
          links · click a node to open
        </span>
      </div>
      <div ref={containerRef} className="graph-canvas" />
      <div className="graph-legend">
        {[...new Set(collections.map((c) => c.id))].map((id, i) => (
          <span key={id}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} />
            {" " + (collections.find((c) =>
              c.id === id
            )?.name ?? id)}
          </span>
        ))}
      </div>
    </div>
  );
}
