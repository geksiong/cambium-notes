import { assert, assertEquals, assertMatch } from "@std/assert";
import {
  parseFenceAttributes,
  parseRhythmGrid,
  renderRhythmGrid,
  rhythmGridToAbc,
} from "../web/plugins/rhythm-grid-core.ts";
import { renderChords } from "../web/plugins/chords-core.ts";
import { parseFence } from "../web/editor/fence.ts";

const GUITAR = `Count:    7   8   9  10  11  12 | 1   2   3
Guitar:   .   F   .   E   .   . | E   -   x
Meaning:             arrive       next cycle`;

const SOLEA = `Count:   12  1  2 | 3  4  5 | 6  7 | 8  9 |10 11
Map A:    X  .  . | X  .  . | X  . | X  . | X  .
Map B:    X  .  . | X  .  . | .  X | X  . | X  .`;

Deno.test("rhythm grid tables: groups, spans, holds, notes and description", () => {
  const { html, tune, problem } = renderRhythmGrid(GUITAR, "rhythm-grid");
  assertEquals(tune, null);
  assertEquals(problem, null);
  assertMatch(
    html,
    /<th class="rg-count rg-group-start" scope="col" data-col="6">1<\/th>/,
  );
  assertMatch(html, />F<\/td>/);
  assertMatch(html, /rg-hold/);
  assertMatch(html, /colspan="3"[^>]*>next cycle</);
  assertMatch(html, /Guitar: light on 3; held on 2; F on 8; E on 10, 1/);
  const notes = renderRhythmGrid(
    "Subdivision:  1 2 3 4 5 6\nTwo groups:   X . . X . .    (3 + 3)",
    "rhythm-grid",
  );
  assertMatch(notes.html, /<td class="rg-note">\(3 \+ 3\)<\/td>/);
  assertMatch(notes.html, /Two groups: strong on 1, 4/);
});

Deno.test("rhythm grid subdivisions and empty markers", () => {
  assertMatch(
    renderRhythmGrid("Count:  3 & 4 &\nB:      . x X .", "").html,
    /B: strong on 4; light on 3&amp;/,
  );
  const typo = renderRhythmGrid(
    "Local count:  1 2 3 4 5 6\nCell A:      A . . Bb . Bb",
    "",
  );
  assertMatch(typo.html, /Cell A: A on 1; Bb on 4, 6/);
  assert(!/>A \.</.test(typo.html));
});

Deno.test("rhythm grid circles, titles and errors", () => {
  const circle = renderRhythmGrid(
    SOLEA,
    '{.rhythm-grid .circle title="Soleá"}',
  );
  assertMatch(circle.html, /class="rg-circle-svg"/);
  assertMatch(circle.html, /<p class="rg-title">Soleá<\/p>/);
  const bad = renderRhythmGrid("Count: 1 2 3\nno label here", "rhythm-grid");
  assertMatch(
    bad.html,
    /Could not draw rhythm grid: line without a &#39;Label:&#39; prefix/,
  );
  const noPlay = renderRhythmGrid(SOLEA, "{.rhythm-grid tempo=100 play=Nope}");
  assertEquals(noPlay.tune, null);
  assertMatch(
    noPlay.html,
    /No playback: play= names rows not in the grid: nope/,
  );
});

Deno.test("fence attributes in Pandoc and plain form", () => {
  assertEquals(
    parseFenceAttributes(
      '{.rhythm-grid .circle #g1 tempo=100 play="Map A; Map B"}',
    ),
    {
      classes: ["rhythm-grid", "circle"],
      id: "g1",
      attrs: { tempo: "100", play: "Map A; Map B" },
    },
  );
  assertEquals(parseFenceAttributes("rhythm-grid tempo=90").attrs, {
    tempo: "90",
  });
});

Deno.test("grid tunes: count-in, play order, sounds and column map", () => {
  const grid = parseRhythmGrid(SOLEA);
  const tune = rhythmGridToAbc(grid, {
    tempo: "100",
    play: "Map A; Map B",
    repeat: "1",
    sound: "Map B=claves",
  });
  assert(tune && "abc" in tune);
  assertMatch(tune.abc, /%%score \(V0 V1 V2\)/);
  // Count-in on 6–11, woodblock low on counts not named like the first (12).
  assertMatch(
    tune.abc,
    /V:V0\n%%MIDI channel 10\n(!mp!f12 ){5}!mp!f12 \| !mf!e12 /,
  );
  assertMatch(
    tune.abc,
    /V:V1\n%%MIDI channel 10\n(z12 ){6}\| !fff!\^D,,12 z12 z12 !fff!\^D,,12/,
  );
  assertMatch(
    tune.abc,
    /V:V2\n%%MIDI channel 10\n[^\n]*\| !fff!\^d12 z12 z12 !fff!\^d12 z12 z12 z12 !fff!\^d12 /,
  );
  for (const [at, column] of Object.entries(tune.columns)) {
    assertMatch(tune.abc.slice(Number(at)), /^ ?(!\w+!)?[\^a-gzA-G]/);
    assert(column >= 0 && column < 12);
  }
  const unknown = rhythmGridToAbc(grid, { tempo: "100", sound: "kazoo" });
  assert(
    unknown && "error" in unknown &&
      /unknown sound "kazoo"/.test(unknown.error),
  );
  assertEquals(rhythmGridToAbc(grid, {}), null);
});

Deno.test("Pandoc attribute fences resolve to their first class", () => {
  const info = parseFence('{.rhythm-grid .circle title="Soleá" tempo=100}');
  assertEquals(info.lang, "rhythm-grid");
  assertEquals(info.title, "Soleá");
  assertEquals(parseFence("{.python .numberLines}").hlLang, "python");
  assertEquals(parseFence("{#only-an-id}").lang, null);
  // Plain and legacy forms are unchanged.
  assertEquals(parseFence("ts{1,3-5}").lang, "ts");
  assertEquals(parseFence('mermaid title="x"').lang, "mermaid");
});

Deno.test("chord blocks draw SVG diagrams or explain bad input", () => {
  const html = renderChords("C x32010 fingers=x32010\nF 133211 fingers=134211");
  assertEquals((html.match(/class="chord-svg"/g) ?? []).length, 2);
  assertMatch(html, /aria-label="C chord diagram"/);
  assertMatch(renderChords("C x32?10"), /Could not draw chord diagram/);
});
