import type {
  CambiumPlugin,
  CodeRenderer,
} from "../../src-core/plugins/types.ts";
import { mountPlayback, noteHighlighter, scoreSwing } from "./abc-playback.ts";
import { parseFenceAttributes } from "../editor/attributes.ts";

/** A score's title: its first `T:` field, as libromorph takes it. */
export function abcTitle(abc: string): string {
  return /^T:[ \t]*(.*?)[ \t]*$/m.exec(abc)?.[1] ?? "";
}

/**
 * Builtin reference plugin: renders ABC music notation inside
 * fenced ```abc blocks using abcjs, demonstrating the editor
 * plugin surface end-to-end. Uses "inline" mode: while the block is not
 * being edited the score replaces the source (like ```mermaid); clicking
 * it or arrowing in reveals the source. Below the score, playback controls
 * (play/pause, loop, restart, progress, tempo) highlight notes as they
 * sound; starting one score pauses any other. `%%MIDI swing N` swings the
 * playback as in libromorph.
 *
 * A listening item (```{.abc .listen}, for ear-training questions) shows
 * only its title and player until the block is edited: the notation is
 * drawn off screen so the player still works.
 *
 * User plugins (.cambium/plugins/*.mjs) use exactly this contract:
 *
 *   export default {
 *     name: "my-plugin", version: "1.0.0",
 *     setup(ctx) { ctx.registerCodeRenderer("graphviz", render); }
 *   }
 */
export const abcPlugin: CambiumPlugin = {
  name: "abc-notation",
  version: "0.1.0",
  description:
    "Renders ABC scores inline in fenced ```abc code blocks, with playback.",
  setup(ctx) {
    const render = ((container, code, context) => {
      const listen = parseFenceAttributes(context?.info).classes.includes(
        "listen",
      );
      let cancelled = false;
      let stopPlayback: (() => void) | null = null;
      container.textContent = "Loading abcjs…";
      import("abcjs")
        .then(({ default: abcjs }) => {
          if (cancelled) return;
          container.innerHTML = "";
          container.classList.add("cb-abc");
          container.classList.toggle("cb-abc-listen", listen);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const api = abcjs as any;
          const score = document.createElement("div");
          if (listen) {
            const title = document.createElement("div");
            title.className = "cb-abc-listen-title";
            title.textContent = `🎵 ${abcTitle(code) || "Listening item"}`;
            // abcjs styles the element it renders into, so hide a wrapper.
            const hidden = document.createElement("div");
            hidden.className = "cb-abc-listen-notation";
            hidden.setAttribute("aria-hidden", "true");
            hidden.appendChild(score);
            container.append(title, hidden);
          } else {
            container.appendChild(score);
          }
          const [tune] = api.renderAbc(score, code, {
            responsive: "resize",
            paddingtop: 4,
            paddingbottom: 4,
            add_classes: true,
          });
          if (tune && tune.lines?.length) {
            stopPlayback = mountPlayback(
              api,
              container,
              tune,
              noteHighlighter(score),
              { swing: scoreSwing(code) },
            );
          }
          if (listen && !stopPlayback) {
            const note = document.createElement("div");
            note.className = "cb-abc-listen-note";
            note.textContent = tune?.lines?.length
              ? "Playback needs Web Audio. Click to see the source."
              : "Nothing to play. Click to see the source.";
            container.appendChild(note);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            container.textContent = `abcjs failed to load: ${
              e instanceof Error ? e.message : e
            }`;
          }
        });
      return () => {
        cancelled = true;
        stopPlayback?.();
      };
    }) as CodeRenderer;

    render.mode = "inline";
    ctx.registerCodeRenderer("abc", render);
  },
};
