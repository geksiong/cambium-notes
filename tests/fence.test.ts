import { assert, assertEquals } from "@std/assert";
import { parseFence } from "../web/editor/fence.ts";

Deno.test("plain language", () => {
  const info = parseFence("ts");
  assertEquals(info.lang, "ts");
  assertEquals(info.meta, "");
  assertEquals(info.hlLang, "ts");
  assertEquals(info.lineMarkers.length, 0);
  assertEquals(info.inlineMarkers.length, 0);
});

Deno.test("empty / null fences", () => {
  assertEquals(parseFence(null).lang, null);
  assertEquals(parseFence(undefined).lang, null);
  assertEquals(parseFence("").lang, null);
  assertEquals(parseFence("   ").lang, null);
});

Deno.test("legacy space-free spec moves braces into meta", () => {
  const info = parseFence("ts{1,3-5}");
  assertEquals(info.lang, "ts");
  assertEquals(info.lineMarkers.length, 2); // {1} and {3-5} items merge? see below
  const lines = info.lineMarkers.flatMap((g) =>
    Array.from({ length: g.to - g.from + 1 }, (_, i) => g.from + i)
  );
  assertEquals(lines.sort(), [1, 3, 4, 5]);
});

Deno.test("keyless ranges, title and wrap", () => {
  const info = parseFence('ts {1, 4, 7-8} title="demo.ts" wrap');
  assertEquals(info.lang, "ts");
  assertEquals(info.title, "demo.ts");
  assertEquals(info.wrap, true);
  const lines = info.lineMarkers.flatMap((g) =>
    Array.from({ length: g.to - g.from + 1 }, (_, i) => g.from + i)
  );
  assertEquals(lines.sort((a, b) => a - b), [1, 4, 7, 8]);
  assertEquals(info.lineMarkers.every((g) => g.type === "mark"), true);
});

Deno.test("negated wrap flag", () => {
  assertEquals(parseFence("js wrap !wrap").wrap, false);
});

Deno.test("typed line markers", () => {
  const info = parseFence('js title="line-markers.js" del={2} ins={3-4} {6}');
  // Groups are emitted keyed: keyless/mark first, then ins, then del.
  assertEquals(
    info.lineMarkers.map((g) => [g.type, g.from, g.to]),
    [
      ["mark", 6, 6],
      ["ins", 3, 4],
      ["del", 2, 2],
    ],
  );
});

Deno.test("labeled line markers", () => {
  const info = parseFence('jsx {"1":5} del={"2":7-8} ins={"3":10-12}');
  assertEquals(info.lineMarkers[0].label, "1");
  assertEquals(info.lineMarkers[0].type, "mark");
  assertEquals(info.lineMarkers[1].type, "ins"); // grouped after mark
  assertEquals(info.lineMarkers[1].label, "3");
  assertEquals(info.lineMarkers[1].from, 10);
  assertEquals(info.lineMarkers[1].to, 12);
  assertEquals(info.lineMarkers[2].label, "2");
  assertEquals(info.lineMarkers[2].type, "del");
});

Deno.test("column selections", () => {
  const info = parseFence("ins={6-7:8-10}");
  const group = info.lineMarkers[0];
  assertEquals(group.cols, [8, 10]);
  assertEquals(group.from, 6);
  assertEquals(group.to, 7);
});

Deno.test("inline plaintext markers", () => {
  const info = parseFence('js "given text" ins="inserted" del=\'deleted\'');
  assertEquals(
    info.inlineMarkers.map((m) => [m.type, m.text]),
    [
      ["mark", "given text"],
      ["ins", "inserted"],
      ["del", "deleted"],
    ],
  );
});

Deno.test("inline regex markers keep source", () => {
  const info = parseFence("ts /ye[sp]/ mark=/return true/");
  assertEquals(info.inlineMarkers[0].regex?.source, "ye[sp]");
  assertEquals(info.inlineMarkers[1].type, "mark");
  assertEquals(info.inlineMarkers[1].regex?.source, "return true");
});

Deno.test("diff language and second highlighting language", () => {
  const info = parseFence('diff lang="js"');
  assertEquals(info.isDiff, true);
  assertEquals(info.hlLang, "js");
  assertEquals(parseFence("diff").hlLang, "diff");
  assertEquals(parseFence("diff").isDiff, true);
});

Deno.test("malformed meta never throws", () => {
  const info = parseFence("ts {abc} {4-} ??? title=");
  assertEquals(info.lang, "ts");
  // garbage is skipped, nothing crashes
  for (const g of info.lineMarkers) {
    assert(Number.isFinite(g.from));
  }
});
