export type IdFormat = "zettel" | "timestamp" | "none";

/** Zettelkasten-style id: YYYYMMDDHHmm (local time). */
export function zettelId(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${
    p(
      d.getHours(),
    )
  }${p(d.getMinutes())}`;
}

export function timestampId(d = new Date()): string {
  return String(d.getTime());
}

export function generateId(format: IdFormat, d = new Date()): string {
  switch (format) {
    case "zettel":
      return zettelId(d);
    case "timestamp":
      return timestampId(d);
    default:
      return "";
  }
}

export function safeFileName(title: string, id: string): string {
  const base = title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
  return id ? `${id}-${base}.md` : `${base}.md`;
}
