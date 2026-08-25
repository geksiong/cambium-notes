/**
 * Cambium editor plugin contract.
 *
 * A plugin is an ES module whose default export satisfies CambiumPlugin.
 * Builtin plugins are bundled; user plugins live in
 * `<collection>/.cambium/plugins/*.mjs` and are imported dynamically by
 * the webview after showing their manifest.
 */

/**
 * Renders the content of a fenced code block tagged with the registered
 * language. May return a cleanup function (called before the next render /
 * on teardown).
 *
 * `mode` controls placement inside the code-block NodeView:
 * - "below" (default): output is shown live below the editable source
 * - "inline": output replaces the source while it is not being edited;
 *   focusing/clicking the block reveals the source again
 */
export interface CodeRenderer {
  (container: HTMLElement, code: string): void | (() => void);
  mode?: "below" | "inline";
}

export interface ToolbarItem {
  id: string;
  label: string;
  icon?: string;
  run(): void;
}

/** Structural type of a TipTap extension; kept loose to avoid a hard dep. */
export type EditorExtension = unknown;

export interface CambiumPluginContext {
  /** Render fenced code blocks with the given language tag specially. */
  registerCodeRenderer(lang: string, renderer: CodeRenderer): void;
  /** Register a raw TipTap extension into the editor schema. */
  registerExtension(ext: EditorExtension): void;
  /** Add a toolbar button. */
  registerToolbar(item: ToolbarItem): void;
}

export interface CambiumPlugin {
  name: string;
  version: string;
  description?: string;
  setup(ctx: CambiumPluginContext): void;
}
