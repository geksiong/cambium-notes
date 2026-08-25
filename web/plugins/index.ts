import type { CambiumPlugin } from "../../src-core/plugins/types.ts";
import { abcPlugin } from "./builtin-abc.ts";
import { mermaidPlugin } from "./builtin-mermaid.ts";

/** All plugins loaded into the editor at startup. */
export const BUILTIN_PLUGINS: CambiumPlugin[] = [abcPlugin, mermaidPlugin];
