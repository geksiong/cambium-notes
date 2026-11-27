/**
 * abcjs playback controls shared by the ABC and rhythm-grid previews: play /
 * pause, loop, restart, a seekable progress bar and tempo, with a highlight
 * callback driven by the playback cursor. Only one preview plays at a time.
 */

// The abcjs typings are loose about synth objects; keep the surface we use.
// deno-lint-ignore no-explicit-any
type Abcjs = any;
// deno-lint-ignore no-explicit-any
export type TuneObject = any;

export interface NoteEvent {
  startChar?: number | null;
  startCharArray?: number[];
  elements?: Element[][];
}

export interface Highlighter {
  show(event: NoteEvent): void;
  clear(): void;
}

interface Controller {
  pause(): void;
  destroy?(): void;
}

let active: Controller | null = null;

// Events that must not reach the block: ProseMirror would move the caret
// and an inline preview would switch to its source on click.
const ISOLATED_EVENTS = [
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "pointerdown",
  "pointerup",
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "paste",
  "copy",
  "cut",
];

/** Notes under the cursor in a rendered abcjs score. */
export function noteHighlighter(score: HTMLElement): Highlighter {
  const clear = () =>
    score.querySelectorAll(".abc-note-playing").forEach((n) =>
      n.classList.remove("abc-note-playing")
    );
  return {
    clear,
    show(event) {
      clear();
      event.elements?.forEach((group) =>
        group.forEach((n) => n.classList.add("abc-note-playing"))
      );
    },
  };
}

/**
 * A score's swing percentage from its `%%MIDI swing N` line, as libromorph
 * reads it (66 = 2:1); 0 when it has none. Values of 50 or less mean straight.
 * libromorph's book-wide `abc_swing` lives in book.yaml, which the editor
 * does not read.
 */
export function scoreSwing(abc: string): number {
  const m = /^%%MIDI\s+swing\s+(\d+)/m.exec(abc);
  return m ? Number(m[1]) : 0;
}

/**
 * Append playback controls for `tune` to `host`, swinging offbeat eighths
 * when `options.swing` is over 50. Returns a cleanup that
 * stops playback and removes the controls, or null when the browser has no
 * Web Audio.
 */
export function mountPlayback(
  abcjs: Abcjs,
  host: HTMLElement,
  tune: TuneObject,
  highlight: Highlighter,
  options: { swing?: number } = {},
): (() => void) | null {
  if (!abcjs.synth?.supportsAudio?.()) return null;
  const bar = document.createElement("div");
  bar.className = "cb-abc-audio";
  for (const ev of ISOLATED_EVENTS) {
    bar.addEventListener(ev, (e) => e.stopPropagation());
  }
  host.appendChild(bar);

  const controller: Controller & Record<string, Abcjs> = new abcjs.synth
    .SynthController();
  controller.load(bar, {
    beatSubDivision: 2,
    onStart() {
      if (active && active !== controller) active.pause();
      active = controller;
    },
    onEvent: (event: NoteEvent) => highlight.show(event),
    onFinished() {
      highlight.clear();
      if (active === controller) active = null;
    },
  }, {
    displayLoop: true,
    displayRestart: true,
    displayPlay: true,
    displayProgress: true,
    displayWarp: true,
  });
  // Swing as libromorph's web reader applies it: abcjs's own option, which
  // only swings X/4 meters.
  const swing = options.swing ?? 0;
  controller.setTune(tune, false, swing > 50 ? { swing } : undefined).catch(
    (err: unknown) => {
      console.error("Failed to prepare ABC playback:", err);
      bar.remove();
    },
  );

  return () => {
    try {
      controller.pause();
      controller.destroy?.();
    } catch {
      // already torn down
    }
    if (active === controller) active = null;
    highlight.clear();
    bar.remove();
  };
}
