import { assertEquals } from "@std/assert";
import { buildGraph } from "../src-core/graph.ts";
import type { NoteRef } from "../src-core/types.ts";

function ref(path: string, links: string[], collectionId = "c1"): NoteRef {
  return {
    path,
    title: path,
    fm: {},
    tags: [],
    links,
    mtime: 0,
    collectionId,
  };
}

Deno.test("builds edges from resolvable wikilinks", () => {
  const g = buildGraph([
    ref("a.md", ["b", "missing"]),
    ref("notes/b.md", ["a"]),
  ]);
  assertEquals(g.nodes.length, 2);
  assertEquals(g.edges.length, 1); // a<->b deduped to one edge
});

Deno.test("ghost nodes optional", () => {
  const notes = [ref("a.md", ["ghost-target"])];
  assertEquals(buildGraph(notes).nodes.length, 1);
  const withGhosts = buildGraph(notes, { ghosts: true });
  assertEquals(withGhosts.nodes.length, 2);
});

Deno.test("scope filters by collection", () => {
  const g = buildGraph([ref("a.md", []), ref("x.md", [], "other")], {
    scopeCollectionId: "other",
  });
  assertEquals(g.nodes.map((n) => n.id), ["x.md"]);
});

Deno.test("degree counts endpoints", () => {
  const g = buildGraph([ref("hub.md", ["leaf"]), ref("leaf.md", [])]);
  const hub = g.nodes.find((n) => n.id === "hub.md")!;
  const leaf = g.nodes.find((n) => n.id === "leaf.md")!;
  assertEquals(hub.degree, 1);
  assertEquals(leaf.degree, 1);
});
