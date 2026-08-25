/**
 * Minimal structural shims for the `deno desktop` APIs.
 *
 * Deno 2.9 ships the desktop runtime but its stable type library does not
 * export `Deno.BrowserWindow` / `Deno.MenuItem` yet, so we access them off
 * `globalThis` with our own narrow types. When upstream types land, swap
 * these usages for the real namespace types and delete this file.
 */

export interface DesktopMenuItem {
  item?: { label: string; id?: string; accelerator?: string; enabled: boolean };
  submenu?: { label: string; items: DesktopMenuItem[] };
  separator?: undefined;
  role?: { role: string };
}

export interface DesktopWindow {
  windowId: number;
  bind(name: string, handler: (...args: unknown[]) => unknown): void;
  unbind(name: string): void;
  setTitle(title: string): void;
  getSize(): [number, number];
  getPosition(): [number, number];
  setApplicationMenu(menu: DesktopMenuItem[]): void;
  addEventListener(type: string, fn: (e: CustomEvent) => void): void;
  executeJs(script: string): Promise<unknown>;
  isClosed(): boolean;
  navigate(url: string): void;
}

type BrowserWindowCtor = new (opts: {
  title?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}) => DesktopWindow;

/** The BrowserWindow constructor when running inside `deno desktop`, else null. */
export function browserWindowCtor(): BrowserWindowCtor | null {
  const d = (globalThis as Record<string, any>).Deno;
  return d && typeof d.BrowserWindow === "function"
    ? (d.BrowserWindow as BrowserWindowCtor)
    : null;
}
