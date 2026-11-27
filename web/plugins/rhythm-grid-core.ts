/**
 * Rhythm grids: box notation for counts, cycles and accent patterns, as
 * LibroMorph draws them (filters/libro_filter.lua and abc_audio.py). Pure
 * functions with no DOM access, so they run in tests too.
 *
 *   ```rhythm-grid
 *   Count:   12  1  2 | 3  4  5 | 6  7 | 8  9 |10 11
 *   Map A:    X  .  . | X  .  . | X  . | X  . | X  .
 *   ```
 *
 * Every line is "Label: cells". The first line is the header (the counts);
 * other rows are matched to its columns by character position, so grids
 * written for a monospaced font keep their meaning. `|` in the header marks
 * a group boundary. Cells: X strong, x light, o muted, . empty, - held from
 * the previous cell; anything else (F, Bb, "next cycle") is text. Text past
 * the last column becomes a note at the end of the row. `.circle` draws a
 * clock face instead of a table.
 */

import {
  type FenceAttributes,
  parseFenceAttributes,
} from "../editor/attributes.ts";

export { type FenceAttributes, parseFenceAttributes };

export interface GridToken {
  text: string;
  /** First and last character index (code points) on the line. */
  s: number;
  e: number;
}

export interface GridCell {
  text: string;
  span: number;
}

export interface GridRow {
  label: string;
  cells: Map<number, GridCell>;
  note: string | null;
}

export interface RhythmGrid {
  header: { label: string; cols: GridToken[]; groupStart: Set<number> };
  rows: GridRow[];
}

const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const num = (value: number) => String(Math.round(value * 10) / 10);

const SYMBOLS: Record<
  string,
  { className: string; mark: string; name: string }
> = {
  X: { className: "rg-strong", mark: "●", name: "strong" },
  x: { className: "rg-light", mark: "●", name: "light" },
  o: { className: "rg-muted", mark: "○", name: "muted" },
};

// Split chars[from..] into tokens at spaces; "|" positions are returned separately.
function tokenize(chars: string[], from: number) {
  const tokens: GridToken[] = [];
  const bars: number[] = [];
  let cur: string | null = null;
  let start = 0;
  const flush = (i: number) => {
    if (cur !== null) tokens.push({ text: cur, s: start, e: i - 1 });
    cur = null;
  };
  for (let i = from; i < chars.length; i++) {
    const c = chars[i];
    if (c === " " || c === "\t") flush(i);
    else if (c === "|") {
      flush(i);
      bars.push(i);
    } else {
      if (cur === null) {
        cur = "";
        start = i;
      }
      cur += c;
    }
  }
  flush(chars.length);
  return { tokens, bars };
}

function splitLabel(line: string) {
  const chars = Array.from(line);
  const colon = chars.indexOf(":");
  if (colon < 0) return null;
  const label = chars.slice(0, colon).join("").trim();
  return /^\p{L}/u.test(label) ? { label, chars, from: colon + 1 } : null;
}

const isWord = (text: string) =>
  Array.from(text).length >= 3 && /^[A-Za-z(]/.test(text);

/** Parse a grid as LibroMorph's Lua filter does; throws with a readable message. */
export function parseRhythmGrid(text: string): RhythmGrid {
  let header: RhythmGrid["header"] | null = null;
  const rawRows: { label: string; tokens: GridToken[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/\S/.test(line)) continue;
    const split = splitLabel(line);
    if (!split) throw new Error(`line without a 'Label:' prefix: ${line}`);
    const { tokens, bars } = tokenize(split.chars, split.from);
    if (!header) {
      if (!tokens.length) throw new Error("the header row has no counts");
      header = { label: split.label, cols: tokens, groupStart: new Set() };
      for (const bar of bars) {
        const ci = tokens.findIndex((col) => col.s > bar);
        if (ci >= 0) header.groupStart.add(ci);
      }
    } else rawRows.push({ label: split.label, tokens });
  }
  if (!header) throw new Error("empty grid");
  if (!rawRows.length) throw new Error("no rows below the header");

  const cols = header.cols;
  const lastEnd = cols[cols.length - 1].e;
  const columnFor = (tok: { s: number; e: number }) => {
    let best = 0;
    let bestD = Infinity;
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      if (tok.s <= col.e && tok.e >= col.s) return ci;
      const d = Math.abs((tok.s + tok.e) / 2 - (col.s + col.e) / 2);
      if (d < bestD) {
        best = ci;
        bestD = d;
      }
    }
    return best;
  };

  const rows = rawRows.map(({ label, tokens }): GridRow => {
    // Join multi-word phrases ("next cycle") separated by single spaces.
    const phrases: (GridToken & { last: string })[] = [];
    for (const tok of tokens) {
      const prev = phrases[phrases.length - 1];
      if (
        prev && tok.s === prev.e + 2 && isWord(prev.last) && isWord(tok.text)
      ) {
        prev.text += ` ${tok.text}`;
        prev.e = tok.e;
        prev.last = tok.text;
      } else phrases.push({ ...tok, last: tok.text });
    }
    const cells = new Map<number, GridCell>();
    const notes: string[] = [];
    for (const ph of phrases) {
      if (ph.s > lastEnd + 1) {
        notes.push(ph.text);
        continue;
      }
      const ci = columnFor(ph);
      const span = ph.text.includes(" ")
        ? Math.max(1, columnFor({ s: ph.e, e: ph.e }) - ci + 1)
        : 1;
      const existing = cells.get(ci);
      // "." only marks an empty cell, so it never merges with content.
      if (!existing || existing.text === ".") {
        cells.set(ci, { text: ph.text, span });
      } else if (ph.text !== ".") existing.text += ` ${ph.text}`;
    }
    return { label, cells, note: notes.length ? notes.join(" ") : null };
  });
  return { header, rows };
}

type CellKind = "empty" | "hold" | "symbol" | "text";

function cellKind(text: string): CellKind {
  if (text === ".") return "empty";
  if (text === "-" || text === "—" || text === "–") return "hold";
  if (SYMBOLS[text]) return "symbol";
  return "text";
}

// Spoken names for header counts: subdivisions take their beat ("3&").
function countNames(cols: GridToken[]): string[] {
  let beat = "";
  return cols.map((col) =>
    /^\d/.test(col.text) ? (beat = col.text) : beat + col.text
  );
}

/** Generated screen-reader description ("Map A: strong on 12, 3, 6"). */
export function describeGrid(grid: RhythmGrid): string {
  const names = countNames(grid.header.cols);
  const parts: string[] = [];
  for (const row of grid.rows) {
    const byKind = new Map<string, string[]>(
      ["strong", "light", "muted", "held"].map((name) => [name, []]),
    );
    grid.header.cols.forEach((_, ci) => {
      const cell = row.cells.get(ci);
      if (!cell) return;
      const kind = cellKind(cell.text);
      const name = kind === "symbol"
        ? SYMBOLS[cell.text].name
        : kind === "hold"
        ? "held"
        : kind === "text"
        ? cell.text
        : null;
      if (!name) return;
      if (!byKind.has(name)) byKind.set(name, []);
      byKind.get(name)!.push(names[ci]);
    });
    const bits = [...byKind].filter(([, at]) => at.length).map(([name, at]) =>
      `${name} on ${at.join(", ")}`
    );
    if (bits.length) parts.push(`${row.label}: ${bits.join("; ")}`);
  }
  const counts = grid.header.cols.map((col) => col.text).join(" ");
  return `Rhythm grid, ${grid.header.label.toLowerCase()} ${counts}${
    parts.length ? `. ${parts.join(". ")}` : ""
  }`;
}

function legend(used: Set<string>): string {
  const items = ["X", "x", "o"].filter((key) => used.has(key)).map((key) =>
    `<span class="${SYMBOLS[key].className}">${SYMBOLS[key].mark}</span> ${
      SYMBOLS[key].name
    }`
  );
  if (used.has("hold")) items.push('<span class="rg-hold-sample"></span> held');
  return items.length ? `<p class="rg-legend">${items.join(" · ")}</p>` : "";
}

function gridTable(grid: RhythmGrid): { html: string; used: Set<string> } {
  const used = new Set<string>();
  const { cols, groupStart } = grid.header;
  const hasNote = grid.rows.some((row) => row.note);
  const cls = (ci: number, base: string) =>
    base + (groupStart.has(ci) ? " rg-group-start" : "");
  const out = [
    '<table class="rg-table">',
    `<thead><tr><th class="rg-label" scope="col">${
      esc(grid.header.label)
    }</th>`,
  ];
  cols.forEach((col, ci) =>
    out.push(
      `<th class="${cls(ci, "rg-count")}" scope="col" data-col="${ci}">${
        esc(col.text)
      }</th>`,
    )
  );
  if (hasNote) out.push('<th class="rg-note" scope="col"></th>');
  out.push("</tr></thead><tbody>");
  for (const row of grid.rows) {
    out.push(`<tr><th class="rg-label" scope="row">${esc(row.label)}</th>`);
    for (let ci = 0; ci < cols.length;) {
      const cell = row.cells.get(ci);
      const kind = cell ? cellKind(cell.text) : "empty";
      const at = `data-col="${ci}"`;
      if (kind === "empty") {
        out.push(`<td class="${cls(ci, "rg-cell rg-empty")}" ${at}></td>`);
      } else if (kind === "hold") {
        used.add("hold");
        out.push(
          `<td class="${
            cls(ci, "rg-cell rg-hold")
          }" ${at}><span class="rg-hold-bar"></span></td>`,
        );
      } else if (kind === "symbol") {
        const sym = SYMBOLS[cell!.text];
        used.add(cell!.text);
        out.push(
          `<td class="${
            cls(ci, `rg-cell ${sym.className}`)
          }" ${at} title="${sym.name}">${sym.mark}</td>`,
        );
      } else {
        const span = Math.min(cell!.span, cols.length - ci);
        const wordy = span > 1 || /[a-z]{3}/.test(cell!.text);
        out.push(
          `<td class="${
            cls(ci, `rg-cell rg-text${wordy ? " rg-phrase" : ""}`)
          }" ${at}${span > 1 ? ` colspan="${span}" data-span="${span}"` : ""}>${
            esc(cell!.text)
          }</td>`,
        );
        ci += span;
        continue;
      }
      ci += 1;
    }
    if (hasNote) out.push(`<td class="rg-note">${esc(row.note ?? "")}</td>`);
    out.push("</tr>");
  }
  out.push("</tbody></table>");
  return { html: out.join(""), used };
}

// Clock face: counts around the outside, one ring per row (outermost first),
// ticks at group boundaries, the header's first count at the top.
function circleSvg(grid: RhythmGrid, description: string): string {
  const { cols } = grid.header;
  const n = cols.length;
  const nrows = grid.rows.length;
  const R_LABEL = 132, R_OUTER = 108, RING_GAP = 26, cx = 160, cy = 152;
  const W = 320;
  const H = 304 + 18 * nrows + 8;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pos = (i: number, r: number) => [
    cx + r * Math.cos(angle(i)),
    cy + r * Math.sin(angle(i)),
  ];
  const fg = "currentColor";
  const desc = esc(description);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="rg-circle-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${desc}" font-family="Helvetica, Arial, sans-serif"><title>${desc}</title>`,
  ];
  const rInner = R_OUTER - RING_GAP * (nrows - 1);
  for (let ri = 0; ri < nrows; ri++) {
    out.push(
      `<circle cx="${cx}" cy="${cy}" r="${
        num(R_OUTER - RING_GAP * ri)
      }" fill="none" stroke="${fg}" stroke-opacity="0.3" stroke-width="1"/>`,
    );
  }
  // Group boundaries: radial ticks halfway before each group start; on a
  // cycle the first count also starts a group.
  const starts = [...grid.header.groupStart];
  if (starts.length && !grid.header.groupStart.has(0)) starts.push(0);
  for (const ci of starts.sort((a, b) => a - b)) {
    const a = angle(ci - 0.5);
    out.push(
      `<line x1="${num(cx + (rInner - 14) * Math.cos(a))}" y1="${
        num(cy + (rInner - 14) * Math.sin(a))
      }" x2="${num(cx + (R_OUTER + 12) * Math.cos(a))}" y2="${
        num(cy + (R_OUTER + 12) * Math.sin(a))
      }" stroke="${fg}" stroke-width="2"/>`,
    );
  }
  cols.forEach((col, ci) => {
    const [x, y] = pos(ci, R_LABEL);
    out.push(
      `<text class="rg-circle-count" data-col="${ci}" x="${num(x)}" y="${
        num(y)
      }" text-anchor="middle" dominant-baseline="central" font-size="15"${
        ci === 0 ? ' font-weight="bold"' : ""
      } fill="${fg}">${esc(col.text)}</text>`,
    );
  });
  grid.rows.forEach((row, ri) => {
    const r = R_OUTER - RING_GAP * ri;
    for (let ci = 0; ci < n; ci++) {
      const [x, y] = pos(ci, r).map(num);
      const cell = row.cells.get(ci);
      const kind = cell ? cellKind(cell.text) : "empty";
      const at = `data-col="${ci}" cx="${x}" cy="${y}"`;
      if (kind === "symbol" && cell!.text === "X") {
        out.push(`<circle ${at} r="9" fill="${fg}"/>`);
      } else if (kind === "symbol" && cell!.text === "x") {
        out.push(`<circle ${at} r="5.5" fill="${fg}"/>`);
      } else if (kind === "symbol") {
        out.push(
          `<circle ${at} r="7" fill="none" stroke="${fg}" stroke-width="2"/>`,
        );
      } else if (kind === "hold") {
        out.push(
          `<circle ${at} r="3.5" fill="none" stroke="${fg}" stroke-width="1.5"/>`,
        );
      } else if (kind === "text") {
        out.push(
          `<text data-col="${ci}" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="bold" fill="${fg}">${
            esc(cell!.text)
          }</text>`,
        );
      } else {
        out.push(`<circle ${at} r="1.8" fill="${fg}" fill-opacity="0.45"/>`);
      }
    }
  });
  grid.rows.forEach((row, ri) => {
    const which = nrows === 1
      ? ""
      : `${
        ri === 0
          ? "outer ring"
          : ri === nrows - 1
          ? "inner ring"
          : `ring ${ri + 1}`
      }: `;
    out.push(
      `<text x="${cx}" y="${
        304 + 18 * ri + 4
      }" text-anchor="middle" font-size="13" fill="${fg}">${which}${
        esc(row.label)
      }</text>`,
    );
  });
  out.push("</svg>");
  return out.join("");
}

// ---------------------------------------------------------------------------
// Audio: a grid with tempo= becomes a percussion ABC tune.
//   tempo=100         numbered counts per minute (unnumbered columns split their count)
//   play="A; B"       rows to sound: commas together, semicolons in turn
//                     (default: every row with X, x or o)
//   repeat=4          cycles of each group (default 4)
//   sound=claves      General MIDI percussion for every row, or per row:
//                     sound="Clave=claves, Surdo=low-tom" (default: clap)
//   count-in=6        counts of woodblock before the claps (default: the second
//                     half of the cycle, or the whole cycle with four counts or fewer)
// The woodblock keeps going under the claps as a practice click: high on every
// count named like the first header count, low on the others.
// ---------------------------------------------------------------------------

export const GRID_SOUNDS: Record<string, number> = {
  clap: 39,
  claves: 75,
  cowbell: 56,
  woodblock: 76,
  "low-woodblock": 77,
  maracas: 70,
  cabasa: 69,
  tambourine: 54,
  "side-stick": 37,
  "bass-drum": 36,
  "low-tom": 41,
  "high-tom": 50,
  conga: 63,
  "low-conga": 64,
  "muted-conga": 62,
  bongo: 60,
  "low-bongo": 61,
  timbale: 65,
  "low-timbale": 66,
  agogo: 67,
  "low-agogo": 68,
  triangle: 81,
  guiro: 74,
  "short-guiro": 73,
  "hi-hat": 42,
  "pedal-hi-hat": 44,
  ride: 51,
};
const GRID_CLAP = 39;
// X and x sit far apart: synthesizers change a clap's level only a little
// between neighbouring dynamics.
const GRID_DYNAMICS: Record<string, string> = {
  X: "!fff!",
  x: "!p!",
  o: "!pp!",
};
const COUNT_IN = [76, 77]; // high / low wood block
const UNITS_PER_BEAT = 12; // L:1/48, so a quarter note is 12 units

function abcDrum(note: number): string {
  const name =
    ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"][
      note % 12
    ];
  const octave = Math.floor(note / 12) - 1;
  return octave >= 5
    ? name.toLowerCase() + "'".repeat(octave - 5)
    : name + ",".repeat(4 - octave);
}

export type GridTune =
  | { abc: string; columns: Record<number, number> }
  | { error: string };

/**
 * The percussion tune for a grid: `{ abc, columns }`, where `columns` maps
 * the character offset of every note and rest in `abc` to the grid column
 * it sounds on. Returns `{ error }` when the grid asks for audio but cannot
 * have it, and null when it has no tempo.
 */
export function rhythmGridToAbc(
  grid: RhythmGrid,
  attrs: Record<string, string>,
): GridTune | null {
  if (!attrs.tempo) return null;
  const tempo = Number(attrs.tempo);
  if (!Number.isFinite(tempo) || tempo <= 0) {
    return {
      error: `tempo must be a positive number, not ${
        JSON.stringify(attrs.tempo)
      }`,
    };
  }
  const repeat = attrs.repeat ? Number(attrs.repeat) : 4;
  if (!Number.isInteger(repeat) || repeat < 1) {
    return {
      error: `repeat must be a whole number of cycles, not ${
        JSON.stringify(attrs.repeat)
      }`,
    };
  }
  const { cols } = grid.header;

  // Each numbered count is one beat, shared equally with the unnumbered
  // columns after it (1 & 2 &, 1 e & a).
  const beats: number[][] = [];
  cols.forEach((col, i) => {
    if (/^\d/.test(col.text) || !beats.length) beats.push([i]);
    else beats[beats.length - 1].push(i);
  });
  const lengths: number[] = [];
  const beatStarts = new Set<number>();
  for (const group of beats) {
    if (UNITS_PER_BEAT % group.length) {
      return { error: `cannot divide a beat into ${group.length} columns` };
    }
    beatStarts.add(group[0]);
    for (const i of group) lengths[i] = UNITS_PER_BEAT / group.length;
  }

  const symbolAt = (row: GridRow, i: number) => {
    const text = row.cells.get(i)?.text;
    return text !== undefined && text in GRID_DYNAMICS ? text : null;
  };
  const byLabel = new Map(
    grid.rows.map((row) => [row.label.toLowerCase(), row]),
  );
  let groups: GridRow[][];
  if (attrs.play) {
    const names = attrs.play.split(";").map((g) =>
      g.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean)
    ).filter((g) => g.length);
    const missing = names.flat().filter((w) => !byLabel.has(w));
    if (missing.length) {
      return {
        error: `play= names rows not in the grid: ${missing.join(", ")}`,
      };
    }
    groups = names.map((g) => g.map((w) => byLabel.get(w)!));
  } else {
    groups = [grid.rows.filter((row) => cols.some((_, i) => symbolAt(row, i)))];
  }
  if (!groups.some((g) => g.length)) {
    return { error: "no rows with X, x or o to play" };
  }

  const sounds = new Map<string, number>();
  let defaultSound = GRID_CLAP;
  for (
    const item of (attrs.sound ?? "").split(",").map((x) => x.trim()).filter(
      Boolean,
    )
  ) {
    const eq = item.lastIndexOf("=");
    const row = eq >= 0 ? item.slice(0, eq).trim().toLowerCase() : "";
    const name = item.slice(eq + 1).trim();
    const note = GRID_SOUNDS[name.toLowerCase()];
    if (note === undefined) {
      return {
        error: `unknown sound "${name}"; choose from ${
          Object.keys(GRID_SOUNDS).join(", ")
        }`,
      };
    }
    if (row) {
      if (!byLabel.has(row)) {
        return {
          error: `sound= names a row not in the grid: ${
            item.slice(0, eq).trim()
          }`,
        };
      }
      sounds.set(row, note);
    } else defaultSound = note;
  }

  let lead: number;
  if (attrs["count-in"]) {
    lead = Number(attrs["count-in"]);
    if (!Number.isInteger(lead)) {
      return {
        error: `count-in must be a number of counts, not ${
          JSON.stringify(attrs["count-in"])
        }`,
      };
    }
  } else {
    lead = beats.length > 4
      ? beats.length - Math.floor(beats.length / 2)
      : beats.length;
  }
  lead = Math.max(0, Math.min(lead, beats.length));
  const leadCols = beats.slice(beats.length - lead).flat();

  // Build the tune while recording where each note and rest starts.
  type Token = [string, number];
  const columns: Record<number, number> = {};
  let abc = "";
  const text = (value: string) => {
    abc += value;
  };
  const token = ([value, column]: Token) => {
    columns[abc.length] = column;
    // abcjs starts the first note after a bar line at the space before it.
    if (abc.endsWith(" ")) columns[abc.length - 1] = column;
    abc += value;
  };
  const tokens = (list: Token[]) =>
    list.forEach((t, i) => {
      if (i) text(" ");
      token(t);
    });
  const first = cols[0].text;
  const click = (i: number): Token => {
    if (!beatStarts.has(i)) return [`z${lengths[i]}`, i];
    const hi = cols[i].text === first; // every count named like the first
    return [
      `${hi ? "!mf!" : "!mp!"}${abcDrum(COUNT_IN[hi ? 0 : 1])}${lengths[i]}`,
      i,
    ];
  };
  const pattern = (row: GridRow, note: number): Token[] =>
    cols.map((_, i) => {
      const sym = symbolAt(row, i);
      return [
        sym
          ? `${GRID_DYNAMICS[sym]}${abcDrum(note)}${lengths[i]}`
          : `z${lengths[i]}`,
        i,
      ];
    });
  const silent: Token[] = cols.map((_, i) => [`z${lengths[i]}`, i]);
  const bars = (list: Token[][]) =>
    list.forEach((cycle, i) => {
      if (i) text(" | ");
      tokens(cycle);
    });

  const voices = groups.flatMap((group, g) =>
    group.map((row) => ({
      g,
      note: sounds.get(row.label.toLowerCase()) ?? defaultSound,
      row,
    }))
  );
  const title = attrs.title ||
    groups.map((group) => group.map((row) => row.label).join(", ")).join(
      " then ",
    );
  const voiceNames = [...voices.map((_, n) => `V${n}`), `V${voices.length}`];
  text(
    `X:1\nT:${
      title.replace(/\n/g, " ")
    }\nM:none\nL:1/48\nQ:1/4=${tempo}\n%%score (${
      voiceNames.join(" ")
    })\nK:C\n`,
  );
  text("V:V0\n%%MIDI channel 10\n");
  if (leadCols.length) {
    tokens(leadCols.map(click));
    text(" | ");
  }
  bars(
    Array.from(
      { length: groups.length * repeat },
      () => cols.map((_, i) => click(i)),
    ),
  );
  text(" |]\n");
  voices.forEach(({ g, row, note }, n) => {
    text(`V:V${n + 1}\n%%MIDI channel 10\n`);
    if (leadCols.length) {
      tokens(leadCols.map((i): Token => [`z${lengths[i]}`, i]));
      text(" | ");
    }
    bars(
      groups.flatMap((_, h) =>
        Array.from(
          { length: repeat },
          () => (h === g ? pattern(row, note) : silent),
        )
      ),
    );
    text(" |]\n");
  });
  return { abc, columns };
}

export interface RenderedGrid {
  /** Grid markup (table, or clock face with `.circle`), or an error box. */
  html: string;
  /** Playback tune when the fence has a usable `tempo`. */
  tune: { abc: string; columns: Record<number, number> } | null;
  /** Why the grid could not be drawn or played, if it couldn't. */
  problem: string | null;
}

/** Render one grid block from its source and fence info string. */
export function renderRhythmGrid(
  source: string,
  info: string | null | undefined,
): RenderedGrid {
  const { classes, attrs } = parseFenceAttributes(info);
  let grid: RhythmGrid;
  try {
    grid = parseRhythmGrid(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      html:
        `<div class="rhythm-grid rhythm-grid-error"><p class="rg-error">Could not draw rhythm grid: ${
          esc(message)
        }</p></div>`,
      tune: null,
      problem: message,
    };
  }
  const description = describeGrid(grid);
  const caption = attrs.title
    ? `<p class="rg-title">${esc(attrs.title)}</p>`
    : "";
  const result = rhythmGridToAbc(grid, attrs);
  const tune = result && "abc" in result ? result : null;
  const problem = result && "error" in result
    ? `No playback: ${result.error}`
    : null;
  const note = problem ? `<p class="rg-error">${esc(problem)}</p>` : "";
  if (classes.includes("circle")) {
    return {
      html: `<div class="rhythm-grid rhythm-grid-circle">${caption}${
        circleSvg(grid, description)
      }${note}</div>`,
      tune,
      problem,
    };
  }
  const table = gridTable(grid);
  return {
    html: `<div class="rhythm-grid" role="group" aria-label="${
      esc(description)
    }">${caption}<div class="rg-scroll">${table.html}</div>${
      legend(table.used)
    }${note}</div>`,
    tune,
    problem,
  };
}
