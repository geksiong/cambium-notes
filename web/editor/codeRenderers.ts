import type { CodeRenderer } from "../../src-core/plugins/types.ts";
import { parseCodeLangSpec } from "./langSpec.ts";

/**
 * Registry powering the plugin API's `registerCodeRenderer`.
 * The WYSIWYG editor consults it for every fenced code block: when a
 * renderer is registered for the block's language, its output is shown
 * live (see RenderableCodeBlock in extensions.ts). Lookups use the base
 * language of a spec like `mermaid{...}`.
 */
const renderers = new Map<string, CodeRenderer>();

export function registerCodeRenderer(
  lang: string,
  renderer: CodeRenderer,
): void {
  renderers.set(lang.toLowerCase(), renderer);
}

export function getCodeRenderer(
  lang: string | null | undefined,
): CodeRenderer | undefined {
  const base = parseCodeLangSpec(lang).lang;
  return base ? renderers.get(base.toLowerCase()) : undefined;
}

export function registeredLanguages(): string[] {
  return [...renderers.keys()];
}
