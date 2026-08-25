import { assert, assertEquals } from "@std/assert";
import {
  applyTemplate,
  collectVars,
  renderTemplate,
} from "../src-core/templates.ts";
import { generateId, safeFileName, zettelId } from "../src-core/ids.ts";

Deno.test("renders known vars, preserves unknown", () => {
  const out = renderTemplate("# {{title}} on {{date}} by {{author}} {{nope}}", {
    title: "Hi",
    date: "2026-08-25",
    author: "me",
  });
  assertEquals(out, "# Hi on 2026-08-25 by me {{nope}}");
});

Deno.test("collectVars finds all placeholders", () => {
  assertEquals(collectVars("{{a}} {{ b_c }} {{a}}"), ["a", "b_c"]);
});

Deno.test("applyTemplate merges frontmatter defaults and renders body", () => {
  const tpl = `---
title: "{{title}}"
tags:
  - from-template
---

# {{title}}
id={{id}} date={{date}}
`;
  const note = applyTemplate(tpl, {
    title: "My Note",
    id: zettelId(),
    author: "GS",
  });
  // Frontmatter keeps template-declared fields, renders the title.
  assert(note.includes("title: My Note"));
  assert(note.includes("- from-template"));
  // Body variables were substituted.
  assert(note.includes("# My Note"));
  assert(/id=\d{12} date=\d{4}-\d{2}-\d{2}/.test(note));
});

Deno.test("frontmatter-less templates gain standard metadata", () => {
  const note = applyTemplate("plain body {{title}}", { title: "T", id: "" });
  assert(/title: T/.test(note));
  assert(/date: \d{4}-\d{2}-\d{2}/.test(note));
  assert(note.includes("plain body T"));
});

Deno.test("ids and filenames", () => {
  assertEquals(zettelId(new Date(2026, 7, 25, 9, 5)), "202608250905");
  assertEquals(generateId("none"), "");
  assertEquals(
    safeFileName("Hello, World! 你好", "1234567890"),
    "1234567890-hello-world-你好.md",
  );
  assertEquals(safeFileName("///", ""), "untitled.md");
});
