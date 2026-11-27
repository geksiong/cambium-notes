/**
 * Pandoc attribute lists as libromorph books write them, on code fences
 * (`{.abc .listen}`, `rhythm-grid tempo=90`) and fenced divs
 * (`::: {.solution title="…"}`, `::: hint`). Pure, so it runs in tests.
 */

export interface FenceAttributes {
  classes: string[];
  id: string;
  attrs: Record<string, string>;
}

/**
 * Classes, id and key=value attributes of a fence info string, in either
 * Pandoc form (`{.rhythm-grid .circle #id tempo=100 play="A; B"}`) or plain
 * form (`rhythm-grid .circle tempo=100`), where the first word is a class.
 */
export function parseFenceAttributes(
  info: string | null | undefined,
): FenceAttributes {
  const source = (info ?? "").trim().replace(/^\{/, "").replace(/\}$/, "");
  const classes: string[] = [];
  const attrs: Record<string, string> = {};
  let id = "";
  for (
    const match of source.matchAll(
      /([^\s=]+)=(?:"([^"]*)"|“([^”]*)”|'([^']*)'|(\S+))|(\S+)/g,
    )
  ) {
    if (match[6] !== undefined) {
      const word = match[6];
      if (word.startsWith("#")) id = word.slice(1);
      else classes.push(word.replace(/^\./, ""));
    } else {
      attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? match[5];
    }
  }
  return { classes, id, attrs };
}
