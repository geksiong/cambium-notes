import { assertEquals } from "@std/assert";
import {
  hasFrontMatter,
  isDraft,
  joinFrontMatter,
  splitFrontMatter,
  tagsFromFrontMatter,
  titleFromNote,
} from "../src-core/frontmatter.ts";

Deno.test("splits yaml frontmatter", () => {
  const text = `---
title: Hello
tags:
  - a
  - b
---

Body line.
`;
  const { fmRaw, fm, body } = splitFrontMatter(text);
  assertEquals(fm.title, "Hello");
  assertEquals(fm.tags, ["a", "b"]);
  assertEquals(body.trim(), "Body line.");
  assertEquals(fmRaw?.startsWith("---"), true);
});

Deno.test("handles missing frontmatter", () => {
  const { fmRaw, fm, body } = splitFrontMatter("just a body");
  assertEquals(fmRaw, null);
  assertEquals(fm, {});
  assertEquals(body, "just a body");
  assertEquals(hasFrontMatter("just a body"), false);
});

Deno.test("keeps malformed frontmatter as raw", () => {
  const text = "---\ntitle: [unclosed\n---\n\nbody";
  const r = splitFrontMatter(text);
  assertEquals(r.fm, {});
  assertEquals(r.body.trim(), "body");
  assertEquals(r.fmRaw !== null, true);
});

Deno.test("round-trips through join", () => {
  const fm = { title: "T", draft: true };
  const joined = joinFrontMatter(fm, "hello");
  const back = splitFrontMatter(joined);
  assertEquals(back.fm.title, "T");
  assertEquals(back.fm.draft, true);
  assertEquals(back.body.trim(), "hello");
});

Deno.test("title fallback and helpers", () => {
  assertEquals(titleFromNote("posts/my-post.md", {}), "my-post");
  assertEquals(titleFromNote("x.md", { title: "Real" }), "Real");
  assertEquals(tagsFromFrontMatter({ tags: "a, b c" }), ["a", "b", "c"]);
  assertEquals(isDraft({ draft: true }), true);
  assertEquals(isDraft({}), false);
});
