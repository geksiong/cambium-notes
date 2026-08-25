import { assert, assertEquals } from "@std/assert";
import {
  extractInlineTags,
  extractWikilinks,
  resolveLink,
  scanNote,
} from "../src-core/links.ts";

Deno.test("extracts wikilink variants", () => {
  const links = extractWikilinks(
    "[[Plain]] [[Target#Section]] [[Other|label]] not [[a real link](x)]",
  );
  assertEquals(links.sort(), ["Other", "Plain", "Target"]);
});

Deno.test("inline tags ignore code fences", () => {
  const tags = extractInlineTags(
    "#real tag here\n```\n#fake in fence\n```\nalso #dash-tag and #n1",
  );
  assert(tags.includes("real"));
  assert(!tags.includes("fake"));
});

Deno.test("resolveLink precedence", () => {
  const paths = ["posts/2024/Launch.md", "notes/launch.md", "Home.md"];
  assertEquals(resolveLink("Home", paths), "Home.md");
  assertEquals(resolveLink("Launch", paths), "posts/2024/Launch.md");
  assertEquals(resolveLink("launch.md", paths), "notes/launch.md");
  assertEquals(resolveLink("missing", paths), null);
});

Deno.test("scanNote merges inline and frontmatter tags", () => {
  const scan = scanNote(
    `---\ntags: [zettel]\n---\n\nText with [[link]] and #inline.`,
  );
  assertEquals(scan.links, ["link"]);
  assertEquals(scan.tags.includes("zettel"), true);
  assertEquals(scan.tags.includes("inline"), true);
});
