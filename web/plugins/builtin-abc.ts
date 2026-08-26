import type {
  CambiumPlugin,
  CodeRenderer,
} from "../../src-core/plugins/types.ts";

/**
 * Builtin reference plugin: renders ABC music notation inside
 * fenced ```abc blocks using abcjs, demonstrating the editor
 * plugin surface end-to-end. Uses "inline" mode: while the block is not
 * being edited the score replaces the source (like ```mermaid); clicking
 * it or arrowing in reveals the source.
 *
 * User plugins (.cambium/plugins/*.mjs) use exactly this contract:
 *
 *   export default {
 *     name: "my-plugin", version: "1.0.0",
 *     setup(ctx) { ctx.registerCodeRenderer("graphviz", render); }
 *   }
 */
export const abcPlugin: CambiumPlugin = {
  name: "abc-notation",
  version: "0.1.0",
  description: "Renders ABC scores inline in fenced ```abc code blocks.",
  setup(ctx) {
    const render = ((container, code) => {
      let cancelled = false;
      container.textContent = "Loading abcjs…";
      import("abcjs")
        .then(({ default: abcjs }) => {
          if (cancelled) return;
          container.innerHTML = "";
          container.classList.add("cb-abc");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const api = abcjs as any;
          api.renderAbc(container, code, {
            responsive: "resize",
            paddingtop: 4,
            paddingbottom: 4,
          });
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            container.textContent = `abcjs failed to load: ${
              e instanceof Error ? e.message : e
            }`;
          }
        });
      return () => {
        cancelled = true;
      };
    }) as CodeRenderer;

    render.mode = "inline";
    ctx.registerCodeRenderer("abc", render);
  },
};
