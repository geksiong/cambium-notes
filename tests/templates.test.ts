import { assert, assertEquals } from "@std/assert";
import {
  applyTemplate,
  collectVars,
  fileNameForPattern,
  renderTemplate,
  setTemplateMeta,
  templateMeta,
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

Deno.test("templateMeta reads pattern and type from frontmatter", () => {
  const tpl = `---
pattern: "{{id}}-{{title}}"
type: daily
---

Body
`;
  assertEquals(templateMeta(tpl), {
    pattern: "{{id}}-{{title}}",
    type: "daily",
  });
  assertEquals(templateMeta("no frontmatter"), {});
});

Deno.test("applyTemplate drops pattern but keeps type in note", () => {
  const tpl = `---
title: "{{title}}"
pattern: "{{id}}-{{title}}"
type: zettel
---

# {{title}}
`;
  const note = applyTemplate(tpl, { title: "My Note", id: "abc123" });
  assert(note.includes("type: zettel"));
  assert(!note.includes("pattern:"));
});

Deno.test("fileNameForPattern renders and sanitizes", () => {
  const vars = {
    title: "Hello, World!",
    id: "123",
    date: "2026-08-25",
  };
  assertEquals(
    fileNameForPattern("{{id}}-{{title}}", vars),
    "123-hello-world.md",
  );
  assertEquals(
    fileNameForPattern("{{date}} {{title}}", vars),
    "2026-08-25-hello-world.md",
  );
  assertEquals(
    fileNameForPattern("Daily {{date}}", vars),
    "daily-2026-08-25.md",
  );
  assertEquals(fileNameForPattern("", vars), null);
  assertEquals(fileNameForPattern(undefined, vars), null);
  assertEquals(
    fileNameForPattern("{{title}} {{unknown}}", vars),
    "hello-world-unknown.md",
  );
});

Deno.test("setTemplateMeta edits reserved keys preserving body", () => {
  const tpl = `---
title: T
tags: []
---

Body here
`;
  const updated = setTemplateMeta(tpl, {
    pattern: "{{date}}",
    type: "daily",
  });
  assertEquals(templateMeta(updated), { pattern: "{{date}}", type: "daily" });
  assert(updated.includes("Body here"));
  assert(updated.includes("title: T"));
  assert(updated.includes("tags:"));

  const cleared = setTemplateMeta(updated, { pattern: "" });
  assertEquals(templateMeta(cleared).pattern, undefined);
});
