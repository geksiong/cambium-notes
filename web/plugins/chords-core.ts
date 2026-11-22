/**
 * Chord diagrams for libromorph ```chord / ```chords blocks: one chord per
 * line, `NAME FRETS` from the lowest string to the highest, with optional
 * `fingers=`, `base=` and `barre=`:
 *
 *   C x32010 fingers=x32010
 *   F 133211 fingers=134211 barre=1
 *   Bb x,1,3,3,3,1 base=1
 *
 * Frets are single digits, or comma-separated for frets above 9. `x` mutes
 * a string, `0` is open. Pure functions, ported from hakushi's
 * remark-chords so the editor draws what the published site shows.
 */

export interface Chord {
  name: string;
  frets: (number | "x")[];
  fingers: string[];
  base?: number;
  barre?: number;
}

const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const split = (value: string) =>
  value.includes(",") ? value.split(",") : [...value];

export function parseChordLine(line: string): Chord {
  const [nameToken, fretsToken, ...opts] = line.trim().split(/\s+/);
  const name = nameToken?.replace(/:$/, "");
  if (!name || !fretsToken) {
    throw new Error("Each chord needs a name and fret positions.");
  }
  const frets = split(fretsToken).map((fret) =>
    fret.toLowerCase() === "x" ? "x" : /^\d+$/.test(fret) ? Number(fret) : NaN
  ) as (number | "x")[];
  if (
    frets.length < 2 || frets.length > 12 ||
    frets.some((fret) => Number.isNaN(fret) || (fret !== "x" && fret > 36))
  ) {
    throw new Error(
      `${name}: use 2–12 strings with x or fret numbers from 0 to 36.`,
    );
  }
  const chord: Chord = { name, frets, fingers: [] };
  for (const option of opts) {
    const [key, value] = option.split("=");
    if (key === "fingers") {
      const fingers = split(value ?? "");
      if (fingers.length !== frets.length) {
        throw new Error(`${name}: fingers must match the string count.`);
      }
      chord.fingers = fingers.map((finger) =>
        /^[0xX-]$/.test(finger) ? "" : finger
      );
    } else if (
      (key === "base" || key === "barre") && /^\d+$/.test(value ?? "") &&
      Number(value) >= 1 && Number(value) <= 36
    ) {
      chord[key] = Number(value);
    } else throw new Error(`${name}: unknown option ${option}.`);
  }
  return chord;
}

export function chordSvg(chord: Chord): string {
  const n = chord.frets.length, sx = 16, fy = 20, top = 44, radius = 6.5;
  const notes = chord.frets.filter((fret): fret is number =>
    fret !== "x" && fret > 0
  );
  const min = Math.min(...notes), max = Math.max(0, ...notes);
  const base = chord.base ?? (max <= 4 || !notes.length ? 1 : min);
  if (max - base > 23 || notes.some((fret) => fret < base)) {
    throw new Error(`${chord.name}: frets do not fit the selected base.`);
  }
  const rows = Math.max(4, max - base + 1), grid = (n - 1) * sx;
  const width = Math.max(26 + grid + 14, [...chord.name].length * 10 + 16);
  const x0 = (width - grid) / 2 + 6;
  const height = top + rows * fy + 10;
  const x = (i: number) => x0 + i * sx;
  const y = (fret: number) => top + (fret - base + 0.5) * fy;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="chord-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${
      esc(chord.name)
    } chord diagram">`,
    `<title>${esc(chord.name)} chord diagram</title>`,
    `<text x="${
      x0 + grid / 2
    }" y="18" text-anchor="middle" font-size="16" font-weight="bold" fill="currentColor">${
      esc(chord.name)
    }</text>`,
  ];
  for (let i = 0; i < n; i++) {
    lines.push(
      `<line x1="${x(i)}" y1="${top}" x2="${x(i)}" y2="${
        top + rows * fy
      }" stroke="currentColor"/>`,
    );
  }
  for (let i = 0; i <= rows; i++) {
    lines.push(
      `<line x1="${x0}" y1="${top + i * fy}" x2="${x0 + grid}" y2="${
        top + i * fy
      }" stroke="currentColor"/>`,
    );
  }
  if (base === 1) {
    lines.push(
      `<rect x="${x0 - 0.5}" y="${top - 4}" width="${
        grid + 1
      }" height="4" fill="currentColor"/>`,
    );
  } else {
    lines.push(
      `<text x="${x0 - 7}" y="${
        y(base) + 4
      }" text-anchor="end" font-size="11" fill="currentColor">${base}fr</text>`,
    );
  }
  type Bar = { fret: number; from: number; to: number; finger: string };
  const bars: Bar[] = [];
  if (chord.barre) {
    const start = chord.frets.findIndex((fret) => fret === chord.barre);
    if (start >= 0) {
      bars.push({
        fret: chord.barre,
        from: start,
        to: n - 1,
        finger: chord.fingers[start],
      });
    }
  }
  const groups = new Map<string, Bar>();
  chord.fingers.forEach((finger, i) => {
    const fret = chord.frets[i];
    if (!finger || fret === "x" || fret === 0) return;
    const key = `${finger}@${fret}`;
    const group = groups.get(key) ?? { fret, from: i, to: i, finger };
    group.to = i;
    groups.set(key, group);
  });
  for (const group of groups.values()) {
    if (group.to > group.from) bars.push(group);
  }
  const barred = new Set<number>();
  for (const bar of bars) {
    if (bar.fret < base || bar.fret >= base + rows) continue;
    lines.push(
      `<rect x="${x(bar.from) - radius}" y="${y(bar.fret) - radius}" width="${
        x(bar.to) - x(bar.from) + 2 * radius
      }" height="${2 * radius}" rx="${radius}" fill="currentColor"/>`,
    );
    for (let i = bar.from; i <= bar.to; i++) {
      if (chord.frets[i] === bar.fret) barred.add(i);
    }
    if (bar.finger) {
      lines.push(
        `<text x="${x(bar.from)}" y="${
          y(bar.fret) + 3.5
        }" text-anchor="middle" font-size="10" class="chord-finger">${
          esc(bar.finger)
        }</text>`,
      );
    }
  }
  chord.frets.forEach((fret, i) => {
    if (fret === "x") {
      lines.push(
        `<text x="${x(i)}" y="${
          top - 8
        }" text-anchor="middle" font-size="14" fill="currentColor">×</text>`,
      );
    } else if (fret === 0) {
      lines.push(
        `<circle cx="${x(i)}" cy="${
          top - 11
        }" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
      );
    } else if (!barred.has(i)) {
      lines.push(
        `<circle cx="${x(i)}" cy="${
          y(fret)
        }" r="${radius}" fill="currentColor"/>`,
      );
      if (chord.fingers[i]) {
        lines.push(
          `<text x="${x(i)}" y="${
            y(fret) + 3.5
          }" text-anchor="middle" font-size="10" class="chord-finger">${
            esc(chord.fingers[i])
          }</text>`,
        );
      }
    }
  });
  lines.push("</svg>");
  return lines.join("");
}

/** Markup for a whole chord block, or an error message for bad input. */
export function renderChords(source: string): string {
  try {
    const chords = source.split(/\r?\n/).filter((line) => line.trim()).map(
      parseChordLine,
    );
    if (!chords.length) throw new Error("No chords defined.");
    return `<div class="chord-diagrams">${
      chords.map((chord) =>
        `<div class="chord-diagram">${chordSvg(chord)}</div>`
      )
        .join("")
    }</div>`;
  } catch (error) {
    return `<p class="cb-diagram-error">Could not draw chord diagram: ${
      esc(error instanceof Error ? error.message : String(error))
    }</p>`;
  }
}
