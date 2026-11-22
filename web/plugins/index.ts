import type { CambiumPlugin } from "../../src-core/plugins/types.ts";
import { abcPlugin } from "./builtin-abc.ts";
import { fretboardPlugin } from "./builtin-fretboards.ts";
import { mermaidPlugin } from "./builtin-mermaid.ts";
import { rhythmGridPlugin } from "./builtin-rhythm-grid.ts";

/** All plugins loaded into the editor at startup. */
export const BUILTIN_PLUGINS: CambiumPlugin[] = [
  abcPlugin,
  mermaidPlugin,
  rhythmGridPlugin,
  fretboardPlugin,
];
