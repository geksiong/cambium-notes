/**
 * Round-trip safety for Pandoc markdown syntax (web/editor/pandoc.ts):
 * loading a document into the editor and serializing it back must not
 * escape, flatten or drop Pandoc-only syntax. When `pandoc` is on PATH the
 * fixture is additionally checked for Pandoc AST equality (soft breaks are
 * normalized to spaces, since the editor reflows paragraph lines).
 */

// happy-dom globals must exist before any DOM-touching module is imported.
import { Window } from "npm:happy-dom@^20.11.6";

const win = new Window({ url: "http://localhost/" });
const g = globalThis as unknown as Record<string, unknown>;
for (
  const key of [
    "window",
    "document",
    "HTMLElement",
    "HTMLIFrameElement",
    "Element",
    "Node",
    "Text",
    "KeyboardEvent",
    "MouseEvent",
    "Event",
    "CustomEvent",
    "MutationObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ]
) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
g.getSelection = () => win.window.getSelection?.() ?? null;

const { Editor } = await import("@tiptap/core");
const { buildExtensions, getMarkdown } = await import(
  "../web/editor/extensions.ts"
);
const { assertEquals } = await import("@std/assert");
const markdownit = (await import("markdown-it")).default;

function roundTrip(md: string): string {
  const editor = new Editor({
    element: null as unknown as HTMLElement,
    extensions: buildExtensions(),
    content: md,
  });
  const out = getMarkdown(editor);
  editor.destroy();
  return out;
}

/** Each case must survive a round trip byte-for-byte. */
const EXACT: Record<string, string> = {
  "bracketed span": 'A [term]{.index entry="Parent!Child"} here.',
  "nested spans + markup": "[outer **b** [in]{.c}]{#o .e k='v'}",
  "empty span anchor": "Anchor []{#a} here.",
  "inline math with backslashes": String
    .raw`Let $\hat{H} |\psi\rangle$ and $\Delta x \, \Delta p \ge 0$.`,
  "display math inline": String.raw`$$\int_0^1 f(x) \, dx \quad (a > 0)$$`,
  "multi-line display math":
    "$$\n\\begin{aligned}\na &= b \\\\\nc &= d % comment\n\\end{aligned}\n$$",
  "math in blockquote keeps prefix": "> Quoted $$x_1 +\n> x_2$$ math.",
  "escaped dollar stays escaped": "Literal \\$x$ and \\$\\$, but $5.",
  "math inside span": "[$a_1$]{.m}",
  "dollar amounts stay text": "Costs $20 and $30.",
  "wikilinks": "See [[Some Note]] and [[folder/Other|alias]].",
  "ruby/tcy shorthand": "{漢字|かんじ} and {tcy:42}",
  "fenced div": "::: note\n**Tip:** text.\n:::",
  "div without space, trailing colons":
    ":::note\na\n:::\n\n::: {.x #y} :::\nb\n:::",
  "nested divs + fence inside":
    "::::: quiz\nQ?\n\n- [x] A\n\n::: tip\nNested.\n:::\n\n```\n:::\n```\n:::::",
  "pipe table": "| A | B |\n|:--|--:|\n| `x` | $y$ |",
};

for (const [name, md] of Object.entries(EXACT)) {
  Deno.test(`pandoc round-trip: ${name}`, () => {
    assertEquals(roundTrip(md), md);
  });
}

Deno.test("pandoc: literal dollars never reload as math", () => {
  // Source escapes → literal `$$x$$` and a literal backslash before `$y$`.
  const md = String.raw`A \$\$x\$\$ and \\\$y\$ end`;
  // A `$` followed by a space can't open math, so it needs no escape.
  const canonical = String.raw`A \$\$x\$$ and \\\$y$ end`;
  assertEquals(roundTrip(md), canonical);
  assertEquals(roundTrip(canonical), canonical);
});

Deno.test("pandoc: unclosed div stays plain text", () => {
  assertEquals(roundTrip("::: note\nnever closed"), "::: note never closed");
});

Deno.test("pandoc: non-attribute braces are not a span", () => {
  // `{not attrs}` is invalid Pandoc attribute syntax → literal text.
  assertEquals(
    roundTrip("[x]{not attrs}"),
    "\\[x\\]{not attrs}",
  );
});

// --- Pandoc AST parity ------------------------------------------------------

async function hasPandoc(): Promise<boolean> {
  try {
    const { success } = await new Deno.Command("pandoc", {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    }).output();
    return success;
  } catch {
    return false;
  }
}

async function pandocAst(md: string): Promise<unknown> {
  const child = new Deno.Command("pandoc", {
    args: ["-f", "markdown", "-t", "json"],
    stdin: "piped",
    stdout: "piped",
  }).spawn();
  const w = child.stdin.getWriter();
  await w.write(new TextEncoder().encode(md));
  await w.close();
  const { stdout } = await child.output();
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (o.t === "SoftBreak") return { t: "Space" };
      return Object.fromEntries(
        Object.entries(o).map(([k, v]) => [k, norm(v)]),
      );
    }
    return x;
  };
  return norm(JSON.parse(new TextDecoder().decode(stdout)).blocks);
}

Deno.test({
  name: "pandoc AST parity: fixture document",
  ignore: !(await hasPandoc()),
  async fn() {
    const src = await Deno.readTextFile(
      new URL("./fixtures/pandoc-syntax.md", import.meta.url),
    );
    assertEquals(await pandocAst(roundTrip(src)), await pandocAst(src));
  },
});

// --- Render parity per Pandoc feature -----------------------------------
//
// Each snippet must render identically before and after a save, both in
// Pandoc (libromorph) and in CommonMark+GFM (the Astro publish path).

const FEATURES: Record<string, string> = {
  "deflist": "Apple\n:   A red fruit.\n\nOrange\n~ Citrus.\n",
  "lineblock": "| Roses are red,\n|    violets are blue.\n",
  "footnote":
    "Text with a note.[^1] And inline.^[Inline note.]\n\n[^1]: The note body.\n",
  "citation": "As shown [@doe2020, p. 3] and @smith.\n",
  "subsup": "H~2~O and x^2^.\n",
  "strike": "Some ~~struck~~ text.\n",
  "html_inline": "Press <kbd>Ctrl</kbd> and a<br>b.\n",
  "html_block": '<div class="x">\n\n**md inside**\n\n</div>\n',
  "comment": "Text <!-- hidden --> more.\n\n<!--\nblock comment\n-->\n",
  "h4": "#### Level four\n\n##### Five\n",
  "headattr": "# Title {#intro .unnumbered}\n",
  "para_quote": "Intro line:\n> quoted?\n",
  "para_heading": "Intro line\n# Heading?\n",
  "para_list": "Intro line\n- item?\n",
  "para_fence": "Intro line\n```\ncode\n```\n",
  "fancylist": "a. alpha\nb. beta\n",
  "hashlist": "#. hash\n#. list\n",
  "examplelist": "(@) example\n(@) two\n",
  "romanlist": "i. roman\nii. two\n",
  "parenlist": "1) one\n2) two\n",
  "startnum": "3. three\n4. four\n",
  "simpletable": "  Right     Left\n-------     ------\n     12     12\n",
  "gridtable":
    "+-----+-----+\n| a   | b   |\n+=====+=====+\n| 1   | 2   |\n+-----+-----+\n",
  "multitable":
    "-----------------\nCol A    Col B\n-------- --------\nx        y\n\n-----------------\n",
  "tablecaption": "| a | b |\n|---|---|\n| 1 | 2 |\n\n: My caption\n",
  "imgattr": "![Alt](img.png){width=50%}\n",
  "figure": "![A figure](f.png)\n",
  "linkattr": '[link](http://x.com){.btn target="_blank"}\n',
  "rawinline": "`<b>x</b>`{=html} here\n",
  "rawblock": "```{=latex}\n\\newpage\n```\n",
  "codeattr":
    '`code`{.python}\n\n```{.python .numberLines startFrom="5"}\nx = 1\n```\n',
  "indentcode": "Para.\n\n    indented code\n    block\n",
  "hardbreak": "line one  \nline two\\\nline three\n",
  "escapes":
    "Literal \\*star\\* and \\_under\\_ and \\# hash.\n\n1\\. not list\n",
  "hr": "a\n\n* * *\n\nb\n",
  "smart": 'Ten\\ items "quotes" -- dash --- here...\n',
  "emphasis": "*a* _b_ **c** __d__ ***e*** snake_case_word\n",
  "autolink": "<http://example.com> and http://bare.com\n",
  "refs": '[ref link][r] and [r].\n\n[r]: http://x.com "Title"\n',
  "tasklist": "- [ ] todo\n- [x] done\n",
  "nested_quote": "> outer\n>\n> > inner\n",
  "mathenv": "\\begin{equation}\nx=1\n\\end{equation}\n",
  "smallcaps": "[Small caps]{.smallcaps}\n",
  "looselist": "- a\n\n- b\n",
  "nestedlist": "- a\n    - b\n    - c\n- d\n",
  "listcontinuation": "- para one\n\n    para two\n- next\n",
  "heading_setext": "Title\n=====\n\nSub\n---\n",
  "backslash_text": "Path C:\\\\Users and a \\\\ b\n",
  "angle": "a < b > c & d\n",
  "entity": "&copy; &amp; &#169;\n",
  "pipes_in_text": "a | b | c\n",
  "tilde_text": "approx ~5 and ~/home\n",
  "underscore_math": "snake $a_1$ and $b_2$\n",
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

async function pandocHtml(md: string): Promise<string> {
  const child = new Deno.Command("pandoc", {
    args: ["-f", "markdown", "-t", "html"],
    stdin: "piped",
    stdout: "piped",
  }).spawn();
  const w = child.stdin.getWriter();
  await w.write(new TextEncoder().encode(md));
  await w.close();
  const { stdout } = await child.output();
  return squash(new TextDecoder().decode(stdout));
}

const commonmark = markdownit({ html: true });
const pandocAvailable = await hasPandoc();

for (const [name, md] of Object.entries(FEATURES)) {
  Deno.test(`commonmark render parity: ${name}`, () => {
    assertEquals(
      squash(commonmark.render(roundTrip(md))),
      squash(commonmark.render(md)),
    );
  });
  Deno.test({
    name: `pandoc render parity: ${name}`,
    ignore: !pandocAvailable,
    async fn() {
      assertEquals(await pandocHtml(roundTrip(md)), await pandocHtml(md));
    },
  });
}
