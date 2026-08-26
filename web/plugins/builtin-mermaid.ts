import type {
  CambiumPlugin,
  CodeRenderer,
} from "../../src-core/plugins/types.ts";

/**
 * Builtin plugin: renders Mermaid diagrams in fenced ```mermaid blocks.
 *
 * Uses the "inline" renderer mode: while the block is not being edited the
 * diagram replaces the source entirely; clicking into it reveals the source
 * for editing (see RenderableCodeBlock). Lazy-loads mermaid on first use.
 */
export const mermaidPlugin: CambiumPlugin = {
  name: "mermaid-diagrams",
  version: "0.1.0",
  description:
    "Renders Mermaid charts inline in fenced ```mermaid code blocks.",
  setup(ctx) {
    let seq = 0;

    const render = ((container, code) => {
      let cancelled = false;

      // Mermaid bakes theme colors into the SVG at render time, so a
      // theme flip needs a full re-render (see listener below).
      const draw = () => {
        if (cancelled) return;
        container.innerHTML = "";
        container.classList.add("cb-mermaid");
        container.textContent = "Rendering diagram…";

        import("mermaid")
          .then(async ({ default: mermaid }) => {
            if (cancelled) return;
            // securityLevel "strict" (default) sanitizes label content; keep
            // explicit so user plugins can't regress it via shared state.
            mermaid.initialize({
              startOnLoad: false,
              securityLevel: "strict",
              theme: document.documentElement.dataset.theme === "light"
                ? "default"
                : "dark",
            });
            const { svg } = await mermaid.render(
              `cambium-mermaid-${seq++}`,
              code,
            );
            if (cancelled) return;
            container.classList.remove("cb-error");
            container.innerHTML = svg;
          })
          .catch((e: unknown) => {
            if (cancelled) return;
            container.classList.add("cb-error");
            container.textContent = `Mermaid error: ${
              e instanceof Error ? e.message : String(e)
            }`;
          });
      };

      draw();

      // Redraw every live diagram when the effective theme flips
      // ("cambium:theme-changed", dispatched by web/state/theme.ts).
      const onThemeChange = () => draw();
      window.addEventListener("cambium:theme-changed", onThemeChange);

      return () => {
        cancelled = true;
        window.removeEventListener("cambium:theme-changed", onThemeChange);
      };
    }) as CodeRenderer;

    render.mode = "inline";
    ctx.registerCodeRenderer("mermaid", render);
  },
};
