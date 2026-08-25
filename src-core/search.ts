import type { NoteRef } from "./types.ts";

export interface SearchHit {
  note: NoteRef;
  score: number;
}

/**
 * Lightweight scoring search: title prefix > title substring >
 * tag match > frontmatter > body frequency. Good enough for the
 * explorer filter and command palette; swap for a real index later.
 */
export function query(
  q: string,
  notes: NoteRef[],
  bodies?: Map<string, string>,
  limit = 30,
): SearchHit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const terms = needle.split(/\s+/);
  const hits: SearchHit[] = [];

  for (const n of notes) {
    const title = n.title.toLowerCase();
    const path = n.path.toLowerCase();
    const tags = n.tags.map((t) => t.toLowerCase()).join(" ");
    let score = 0;
    let ok = true;

    for (const t of terms) {
      let s = 0;
      if (title.startsWith(t)) s += 60;
      else if (title.includes(t)) s += 40;
      if (path.includes(t)) s += 10;
      if (tags.includes(t)) s += 20;
      if (bodies) {
        const b = bodies.get(n.path)?.toLowerCase() ?? "";
        if (b.includes(t)) s += Math.min(15, 3 + countOccurrences(b, t));
      }
      if (s === 0) {
        ok = false;
        break;
      }
      score += s;
    }
    if (ok) hits.push({ note: n, score });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function countOccurrences(haystack: string, needle: string): number {
  let i = 0;
  let n = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}
