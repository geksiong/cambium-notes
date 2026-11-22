import type {
  CambiumPlugin,
  CodeRenderer,
} from "../../src-core/plugins/types.ts";
import { type Highlighter, mountPlayback } from "./abc-playback.ts";
import { renderRhythmGrid } from "./rhythm-grid-core.ts";

/**
 * Builtin plugin: draws libromorph rhythm grids (```rhythm-grid, or
 * ```{.rhythm-grid .circle title="…"}) as box-notation tables or clock
 * faces (see rhythm-grid-core.ts). A grid with `tempo=` gets playback
 * controls: it plays as a percussion tune with a woodblock count-in, and the
 * sounding column is highlighted. "inline" mode, like ```abc.
 */
export const rhythmGridPlugin: CambiumPlugin = {
  name: "rhythm-grids",
  version: "0.1.0",
  description:
    "Draws ```rhythm-grid count grids as box notation or cycles, with playback when they set a tempo.",
  setup(ctx) {
    const render = ((container, code, context) => {
      let cancelled = false;
      let stopPlayback: (() => void) | null = null;
      const { html, tune } = renderRhythmGrid(code, context?.info);
      container.classList.add("cb-rhythm-grid");
      container.innerHTML = html;
      const grid = container.querySelector<HTMLElement>(".rhythm-grid");

      if (tune && grid) {
        import("abcjs")
          .then(({ default: abcjs }) => {
            if (cancelled) return;
            // deno-lint-ignore no-explicit-any
            const api = abcjs as any;
            // The tune is never shown; render it hidden for abcjs' timing data.
            const hidden = document.createElement("div");
            hidden.hidden = true;
            grid.appendChild(hidden);
            const [visual] = api.renderAbc(hidden, tune.abc);
            if (!visual) return;
            const cells = [...grid.querySelectorAll<Element>("[data-col]")].map(
              (el) => {
                const start = Number(el.getAttribute("data-col"));
                const span = Number(el.getAttribute("data-span") || 1);
                return { el, start, end: start + span };
              },
            );
            let current = -1;
            const highlight: Highlighter = {
              clear() {
                current = -1;
                cells.forEach(({ el }) => el.classList.remove("rg-playing"));
              },
              show(event) {
                const column = (event.startCharArray ?? [event.startChar])
                  .map((at) => (at == null ? undefined : tune.columns[at]))
                  .find((c) => c !== undefined);
                if (column === undefined || column === current) return;
                current = column;
                cells.forEach(({ el, start, end }) =>
                  el.classList.toggle(
                    "rg-playing",
                    column >= start && column < end,
                  )
                );
              },
            };
            stopPlayback = mountPlayback(api, grid, visual, highlight);
          })
          .catch((e: unknown) => {
            console.error("abcjs failed to load:", e);
          });
      }

      return () => {
        cancelled = true;
        stopPlayback?.();
      };
    }) as CodeRenderer;

    render.mode = "inline";
    ctx.registerCodeRenderer("rhythm-grid", render);
  },
};
