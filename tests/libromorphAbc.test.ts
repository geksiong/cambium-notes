import { assertEquals } from "@std/assert";
import { scoreSwing } from "../web/plugins/abc-playback.ts";
import { abcTitle } from "../web/plugins/builtin-abc.ts";
import { divDisplay } from "../web/editor/pandoc.ts";
import { parseFenceAttributes } from "../web/editor/attributes.ts";

Deno.test("scoreSwing reads %%MIDI swing like libromorph", () => {
  assertEquals(scoreSwing("X:1\n%%MIDI swing 66\nK:C\nCD|"), 66);
  assertEquals(scoreSwing("X:1\n%%MIDI  swing   50\nK:C"), 50);
  assertEquals(scoreSwing("X:1\nK:C\nCD|"), 0);
  // Only at the start of a line, as libromorph's pattern requires.
  assertEquals(scoreSwing("X:1\nN: use %%MIDI swing 66\nK:C"), 0);
});

Deno.test("abcTitle takes the first T: field", () => {
  assertEquals(abcTitle("X:1\nT:  Question 3 \nT:Other\nK:C"), "Question 3");
  assertEquals(abcTitle("X:1\nK:C"), "");
});

Deno.test("listening items are recognised from the fence", () => {
  assertEquals(parseFenceAttributes("{.abc .listen}").classes, [
    "abc",
    "listen",
  ]);
  assertEquals(
    parseFenceAttributes("{#q1 .abc .listen}").classes.includes("listen"),
    true,
  );
  assertEquals(parseFenceAttributes("abc").classes.includes("listen"), false);
});

Deno.test("divDisplay labels hints and solutions", () => {
  assertEquals(divDisplay("::: hint"), { label: "Hint", kind: "hint" });
  assertEquals(divDisplay(":::: solution ::::"), {
    label: "Solution",
    kind: "solution",
  });
  assertEquals(
    divDisplay('::: {#s .solution title="Solution and analysis" open="open"}'),
    { label: "Solution and analysis", kind: "solution" },
  );
  assertEquals(divDisplay("::: {.quiz}"), { label: "{.quiz}", kind: null });
  assertEquals(divDisplay("::: note"), { label: "note", kind: null });
});
