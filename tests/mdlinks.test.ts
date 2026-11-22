import { assertEquals } from "@std/assert";
import {
  extractMdLinks,
  joinRelative,
  relativePath,
  rewriteMdLinksTo,
  rewriteMovedNoteLinks,
} from "../src-core/mdlinks.ts";
import { scanNote } from "../src-core/links.ts";
import { rewriteLinksForRename } from "../src-core/rename.ts";
import { buildGraph } from "../src-core/graph.ts";

Deno.test("path helpers stay inside the collection", () => {
  assertEquals(
    joinRelative("book/part1", "../part2/ch.md"),
    "book/part2/ch.md",
  );
  assertEquals(joinRelative("", "./a.md"), "a.md");
  assertEquals(joinRelative("", "../outside.md"), null);
  assertEquals(
    relativePath("book/part1", "book/part2/ch.md"),
    "../part2/ch.md",
  );
  assertEquals(relativePath("book", "book/ch.md"), "ch.md");
  assertEquals(relativePath("", "a/b.md"), "a/b.md");
});

Deno.test("finds .md links relative to the note, skipping code and URLs", () => {
  const text = [
    "See [setup](02-setup.md#install), [up](../intro.md) and [sp](<my note.md>).",
    'Also [enc](my%20note.md "Title") and ![img](pic.md) and [web](https://x.test/a.md).',
    "[root](/abs.md) [anchor](#here) [txt](notes.txt) [out](../../escape.md)",
    "",
    "```md",
    "[in code](02-setup.md)",
    "```",
    "",
    "[ref]: ./appendix/a.md#top",
  ].join("\n");
  assertEquals(extractMdLinks(text, "book/01-start.md"), [
    "book/02-setup.md",
    "intro.md",
    "book/my note.md",
    "book/appendix/a.md",
  ]);
});

Deno.test("scanNote lists .md link targets next to wikilinks", () => {
  const scan = scanNote("[[Other]] and [two](two.md)", true, "dir/one.md");
  assertEquals(scan.links, ["Other", "dir/two.md"]);
  // Without a note path only wikilinks are reported (old behaviour).
  assertEquals(scanNote("[two](two.md)").links, []);
});

Deno.test(".md links become graph edges", () => {
  const graph = buildGraph([
    {
      path: "a/one.md",
      title: "One",
      fm: {},
      tags: [],
      links: ["a/two.md"],
      mtime: 0,
      collectionId: "c",
    },
    {
      path: "a/two.md",
      title: "Two",
      fm: {},
      tags: [],
      links: [],
      mtime: 0,
      collectionId: "c",
    },
  ]);
  assertEquals(graph.edges, [{ source: "a/one.md", target: "a/two.md" }]);
});

Deno.test("rename rewrites .md links relative to each linking note", () => {
  const text =
    "[a](old.md#sec) [b](./old.md) [c](<old.md>) [d](other.md)\n\n[r]: old.md";
  const { text: out, count } = rewriteMdLinksTo(
    text,
    "book/ch1.md",
    "book/old.md",
    "book/sub/new name.md",
  );
  assertEquals(count, 4);
  assertEquals(
    out,
    "[a](sub/new%20name.md#sec) [b](./sub/new%20name.md) [c](<sub/new name.md>) [d](other.md)\n\n[r]: sub/new%20name.md",
  );
});

Deno.test("rewriteLinksForRename handles wikilinks and .md links together", () => {
  const paths = ["notes/Old.md", "notes/linker.md"];
  const { text, count } = rewriteLinksForRename(
    "[[Old]] and [old](Old.md#x)",
    "notes/Old.md",
    "archive/New.md",
    paths,
    "notes/linker.md",
  );
  assertEquals(text, "[[New]] and [old](../archive/New.md#x)");
  assertEquals(count, 2);
});

Deno.test("a moved note keeps its own links pointing at the same notes", () => {
  const text =
    "[sib](sibling.md) [deep](sub/x.md#h) [me](self.md) [web](https://a.md)";
  const { text: out, count } = rewriteMovedNoteLinks(
    text,
    "a/self.md",
    "b/c/self.md",
  );
  assertEquals(count, 2); // the self-link is still "self.md"
  assertEquals(
    out,
    "[sib](../../a/sibling.md) [deep](../../a/sub/x.md#h) [me](self.md) [web](https://a.md)",
  );
  // Same folder: nothing changes.
  assertEquals(
    rewriteMovedNoteLinks(text, "a/self.md", "a/renamed.md").count,
    1,
  );
});
