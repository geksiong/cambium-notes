import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  cleanRelPath,
  normalizeRename,
  rewriteLinksForRename,
} from "../src-core/rename.ts";

Deno.test("cleanRelPath normalises separators and noise", () => {
  assertEquals(cleanRelPath("notes/idea.md"), "notes/idea.md");
  assertEquals(cleanRelPath("./notes/idea.md"), "notes/idea.md");
  assertEquals(cleanRelPath("/notes/idea.md"), "notes/idea.md");
  assertEquals(cleanRelPath("notes\\idea.md"), "notes/idea.md");
  assertEquals(cleanRelPath("a//b/./c.md"), "a/b/c.md");
});

Deno.test("cleanRelPath rejects traversal", () => {
  assertThrows(() => cleanRelPath("../secrets.md"), Error, "escapes");
  assertThrows(() => cleanRelPath("notes/../../x.md"), Error, "escapes");
});

Deno.test("normalizeRename validates and keeps case-only renames", () => {
  assertEquals(
    normalizeRename(" ./Old.md ", "new/New.md"),
    { from: "Old.md", to: "new/New.md" },
  );
  assertThrows(() => normalizeRename("same.md", "./same.md"));
  assertEquals(normalizeRename("Foo.md", "foo.md"), {
    from: "Foo.md",
    to: "foo.md",
  });
});

Deno.test("rewrites bare-basename links, keeps heading and label", () => {
  const paths = ["notes/Old.md", "Inbox.md"];
  const { text, count } = rewriteLinksForRename(
    "See [[Old]] and [[Old#Section|the note]] and [[Inbox]].",
    "notes/Old.md",
    "archive/Renamed.md",
    paths,
  );
  assertEquals(count, 2);
  assertEquals(
    text,
    "See [[Renamed]] and [[Renamed#Section|the note]] and [[Inbox]].",
  );
});

Deno.test("path-like targets are rewritten to the full new path", () => {
  const paths = ["posts/Old.md"];
  const { text, count } = rewriteLinksForRename(
    "Link: [[posts/Old.md]]",
    "posts/Old.md",
    "posts/2026/Renamed.md",
    paths,
  );
  assertEquals(count, 1);
  assertEquals(text, "Link: [[posts/2026/Renamed.md]]");
});

Deno.test("ambiguous basename links only rewrite when they resolve to from", () => {
  // Two notes share the basename "Launch"; a bare [[Launch]] resolves to the
  // first match (a/Launch.md), so it must stay untouched, while the explicit
  // [[b/Launch]] follows its target to the new location (path shape kept).
  const paths = ["a/Launch.md", "b/Launch.md"];
  const { text } = rewriteLinksForRename(
    "[[Launch]] [[b/Launch]]",
    "b/Launch.md",
    "b/Liftoff.md",
    paths,
  );
  assertEquals(text, "[[Launch]] [[b/Liftoff]]");
});

Deno.test("links inside code fences are untouched", () => {
  const text = [
    "real: [[Old]]",
    "```md",
    "example: [[Old]]",
    "~~~",
    "also: [[Old]]",
    "~~~",
    "```",
    "after: [[Old#H]]",
  ].join("\n");
  const { text: out, count } = rewriteLinksForRename(
    text,
    "Old.md",
    "New.md",
    ["Old.md"],
  );
  assertEquals(count, 2);
  assert(out.includes("example: [[Old]]"));
  assert(out.includes("also: [[Old]]"));
  assertEquals(out.includes("after: [[New#H]]"), true);
});

Deno.test("unrelated notes are returned unchanged", () => {
  const text = "[[Other]] and [[Old#x|y]]";
  const { text: out, count } = rewriteLinksForRename(
    text,
    "Missing.md",
    "New.md",
    ["Other.md"],
  );
  assertEquals(count, 0);
  assertEquals(out, text);
});
