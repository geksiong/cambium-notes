import type {
  CambiumPlugin,
  CodeRenderer,
} from "../../src-core/plugins/types.ts";
import { renderChords } from "./chords-core.ts";

/**
 * Builtin plugin: guitar diagrams from libromorph books.
 * - ```chord / ```chords: chord shapes drawn as SVG (see chords-core.ts)
 * - ```fretboard: JSON for fretboard.js, a named scale
 *   (`{"scale":{"root":"A","type":"minor pentatonic"}}`) or marked positions
 *   (`{"dots":[{"string":6,"fret":5,"label":"1"}]}`)
 * - ```fretdrom: Fretdrom's JSON5 notation for scale boxes and tabs
 * fretboard.js and Fretdrom are bundled (vendor/) and loaded on first use.
 * All draw in the app's ink colour and follow the theme. "inline" mode.
 */

interface FretboardSpec {
  title?: string;
  tuning?: string[];
  fretCount?: number;
  scale?: { root: string; type: string };
  dots?: { string: number; fret: number; label?: string | number }[];
}

interface FretboardInstance {
  renderScale(scale: FretboardSpec["scale"]): void;
  style(opts: unknown): void;
  setDots(dots: FretboardSpec["dots"]): FretboardInstance;
  render(): void;
}

declare global {
  interface Window {
    fretboard?: { Fretboard: new (opts: unknown) => FretboardInstance };
    FretDrom?: { renderSVG(source: string): string };
  }
}

const FRETBOARD_URL = new URL("./vendor/fretboard.umd.js", import.meta.url)
  .href;
const FRETDROM_URL = new URL("./vendor/fretdrom.min.js", import.meta.url).href;

const scripts = new Map<string, Promise<void>>();
function loadScript(url: string): Promise<void> {
  if (!scripts.has(url)) {
    scripts.set(
      url,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => {
          scripts.delete(url);
          reject(new Error("could not load the diagram renderer"));
        };
        document.head.append(script);
      }),
    );
  }
  return scripts.get(url)!;
}

type Dot = { label?: string | number; note?: string };

// fretboard.js scale dots carry a note name such as "Bb" or "F#".
function dotLabel(dot: Dot): string {
  if (dot.label != null) return String(dot.label);
  if (typeof dot.note === "string") {
    return dot.note.charAt(0) +
      dot.note.slice(1).replace(/#/g, "♯").replace(/b/g, "♭");
  }
  return "";
}

/** Validate a ```fretboard JSON spec; throws with a readable message. */
export function parseFretboardSpec(source: string): FretboardSpec {
  const spec = JSON.parse(source) as FretboardSpec;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error("Expected a JSON object.");
  }
  if (!spec.scale && !Array.isArray(spec.dots)) {
    throw new Error("Provide scale or dots.");
  }
  return spec;
}

function drawFretboard(target: HTMLElement, source: string) {
  const spec = parseFretboardSpec(source);
  const tuning = spec.tuning ?? ["E2", "A2", "D3", "G3", "B3", "E4"];
  if (
    !Array.isArray(tuning) || tuning.length < 2 || tuning.length > 12 ||
    tuning.some((note) => typeof note !== "string")
  ) throw new Error("Tuning must contain 2 to 12 strings, low to high.");
  const fretCount = spec.fretCount ?? 15;
  if (!Number.isInteger(fretCount) || fretCount < 1 || fretCount > 35) {
    throw new Error("fretCount must be from 1 to 35.");
  }
  const color = getComputedStyle(target).color;
  // Size the drawing to the fret count and scale dots, text and padding
  // with it, so labels stay readable when the SVG is scaled to fit.
  const width = Math.max(600, fretCount * 50);
  const k = width / 600;
  const board = new window.fretboard!.Fretboard({
    el: target,
    tuning,
    stringCount: tuning.length,
    fretCount,
    width,
    height: Math.round(32 * k) * (tuning.length - 1),
    dotSize: 29 * k,
    dotTextSize: 17 * k,
    dotStrokeWidth: 2 * k,
    topPadding: 28 * k,
    bottomPadding: 15 * k,
    leftPadding: 32 * k,
    rightPadding: 24 * k,
    fretNumbersHeight: 40 * k,
    fretNumbersMargin: 24 * k,
    stringColor: color,
    fretColor: color,
    nutColor: color,
    fretNumbersColor: color,
    // fretboard.js draws the 12th fret in red; keep its extra width as an
    // octave marker, in the ink colour.
    middleFretColor: color,
    dotStrokeColor: color,
    dotFill: "#fff",
    dotText: dotLabel,
  });
  if (spec.scale) {
    if (
      typeof spec.scale.root !== "string" || typeof spec.scale.type !== "string"
    ) throw new Error("scale needs root and type.");
    board.renderScale(spec.scale);
    board.style({
      filter: { interval: "1P" },
      fill: "#b91c1c",
      text: dotLabel,
      fontFill: "#fff",
    });
  } else {
    for (const dot of spec.dots!) {
      if (
        !Number.isInteger(dot.string) || dot.string < 1 ||
        dot.string > tuning.length || !Number.isInteger(dot.fret) ||
        dot.fret < 0 || dot.fret > fretCount
      ) throw new Error("Dots need valid string and fret positions.");
    }
    board.setDots(spec.dots).render();
  }
  const svg = target.querySelector("svg");
  if (svg) {
    svg.querySelector(".fret-numbers")?.setAttribute(
      "font-size",
      String(16 * k),
    );
    // Two-character labels ("B♭", "♭7") fit a dot at full size; longer
    // ones would overflow it.
    svg.querySelectorAll(".dot-text").forEach((text) => {
      if ((text.textContent ?? "").length >= 3) {
        text.setAttribute("font-size", String(13 * k));
      }
    });
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", spec.title || "Fretboard diagram");
  }
}

function drawFretdrom(target: HTMLElement, source: string) {
  const markup = window.FretDrom!.renderSVG(source);
  // An SVG loaded as an image runs no embedded scripts or event handlers.
  const image = document.createElement("img");
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  image.alt = "Fretdrom diagram";
  target.append(image);
}

function showError(container: HTMLElement, what: string, error: unknown) {
  const message = document.createElement("p");
  message.className = "cb-diagram-error";
  message.textContent = `Could not draw ${what}: ${
    error instanceof Error ? error.message : String(error)
  }`;
  container.replaceChildren(message);
}

export const fretboardPlugin: CambiumPlugin = {
  name: "guitar-diagrams",
  version: "0.1.0",
  description:
    "Draws ```chord shapes, ```fretboard scales and positions, and ```fretdrom boxes.",
  setup(ctx) {
    const chords = ((container, code) => {
      container.classList.add("cb-chords");
      container.innerHTML = renderChords(code);
    }) as CodeRenderer;
    chords.mode = "inline";
    ctx.registerCodeRenderer("chord", chords);
    ctx.registerCodeRenderer("chords", chords);

    const fretboard = ((container, code) => {
      let cancelled = false;
      container.classList.add("cb-fretboard");
      let title = "";
      try {
        title = parseFretboardSpec(code).title ?? "";
      } catch (error) {
        showError(container, "fretboard", error);
        return;
      }
      // Redraw on theme flips: fretboard.js bakes the ink colour in.
      const draw = () => {
        if (cancelled) return;
        loadScript(FRETBOARD_URL).then(() => {
          if (cancelled) return;
          container.replaceChildren();
          if (title) {
            const caption = document.createElement("p");
            caption.className = "cb-fretboard-title";
            caption.textContent = title;
            container.append(caption);
          }
          const target = document.createElement("div");
          container.append(target);
          try {
            drawFretboard(target, code);
          } catch (error) {
            showError(container, "fretboard", error);
          }
        }).catch((error) => {
          if (!cancelled) showError(container, "fretboard", error);
        });
      };
      container.textContent = "Loading fretboard…";
      draw();
      window.addEventListener("cambium:theme-changed", draw);
      return () => {
        cancelled = true;
        window.removeEventListener("cambium:theme-changed", draw);
      };
    }) as CodeRenderer;
    fretboard.mode = "inline";
    ctx.registerCodeRenderer("fretboard", fretboard);

    const fretdrom = ((container, code) => {
      let cancelled = false;
      container.classList.add("cb-fretboard", "cb-fretdrom");
      container.textContent = "Loading Fretdrom…";
      loadScript(FRETDROM_URL).then(() => {
        if (cancelled) return;
        container.replaceChildren();
        try {
          drawFretdrom(container, code);
        } catch (error) {
          showError(container, "Fretdrom diagram", error);
        }
      }).catch((error) => {
        if (!cancelled) showError(container, "Fretdrom diagram", error);
      });
      return () => {
        cancelled = true;
      };
    }) as CodeRenderer;
    fretdrom.mode = "inline";
    ctx.registerCodeRenderer("fretdrom", fretdrom);
  },
};
