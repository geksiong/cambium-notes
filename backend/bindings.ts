import type { CambiumService } from "./services.ts";
import { METHODS } from "./methods.ts";
import type { DesktopWindow } from "./desktop-shim.ts";

/** Registers every RPC method as an in-process binding on the window. */
export function registerBindings(
  win: DesktopWindow,
  svc: CambiumService,
): void {
  for (const [name, handler] of Object.entries(METHODS)) {
    win.bind(name, (args?: unknown) => handler(svc, args as any));
  }
}
