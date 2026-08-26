import { assert } from "@std/assert";
import MarkdownIt from "markdown-it";
import { patchFenceRenderer } from "../web/editor/fence.ts";

/** Render a fence through markdown-it with the editor's renderer patch. */
function renderFence(info: string, code: string): string {
  const md = new MarkdownIt();
  patchFenceRenderer(md);
  return md.render(`\`\`\`${info}\n${code}\n\`\`\`\n`);
}

Deno.test("fence renderer keeps the full info string in data-info", () => {
  const html = renderFence(
    'ts {1, 4} title="demo.ts" ins={2}',
    "const a = 1;",
  );
  assert(html.includes('class="language-ts"'));
  assert(html.includes("const a = 1;"));
  // data-info carries language + meta verbatim (HTML-escaped in markup)
  assert(html.includes(/data-info="/.source));
});

Deno.test("data-info survives HTML attribute escaping", () => {
  const info = 'ts {1, 4, 7-8} title="demo & <test>.ts" ins={2}';
  const html = renderFence(info, "code();");
  const match = /data-info="([^"]*)"/.exec(html);
  assert(match !== null);
  // Decode the attribute exactly as a browser would when handing the
  // value to getAttribute().
  const decoded = match[1]
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
  assertEquals2(decoded, info);
});

// Tiny wrapper so the assertion failure names the values.
function assertEquals2(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(
      `round-trip mismatch:\n  actual:   ${JSON.stringify(actual)}\n  expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
