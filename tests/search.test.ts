import { assertEquals } from "@std/assert";
import { query } from "../src-core/search.ts";
import type { NoteRef } from "../src-core/types.ts";

function ref(path: string, title: string, tags: string[] = []): NoteRef {
  return { path, title, fm: {}, tags, links: [], mtime: 0, collectionId: "c" };
}

const notes = [
  ref("a.md", "Deno Desktop Guide"),
  ref("b.md", "Cooking pasta", ["kitchen"]),
  ref("c.md", "Random thoughts"),
];

Deno.test("title matches rank above body matches", () => {
  const bodies = new Map([
    ["c.md", "mentions deno desktop once"],
    ["a.md", ""],
  ]);
  const hits = query("deno desktop", notes, bodies);
  assertEquals(hits[0].note.path, "a.md");
  assertEquals(hits.length, 2);
});

Deno.test("tag matches found", () => {
  const hits = query("kitchen", notes);
  assertEquals(hits[0].note.path, "b.md");
});

Deno.test("all terms required", () => {
  assertEquals(query("deno cooking", notes).length, 0);
});
