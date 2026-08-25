import * as path from "@std/path";
import type { CambiumService } from "./services.ts";
import { registerBindings } from "./bindings.ts";
import { configDir } from "../adapters/settings.ts";
import type { DesktopMenuItem, DesktopWindow } from "./desktop-shim.ts";
import { browserWindowCtor } from "./desktop-shim.ts";

const GEOMETRY_FILE = () => path.join(configDir(), "window.json");

interface Geometry {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

async function loadGeometry(): Promise<Geometry> {
  try {
    return JSON.parse(await Deno.readTextFile(GEOMETRY_FILE()));
  } catch {
    return {};
  }
}

function appMenu(): DesktopMenuItem[] {
  const item = (
    label: string,
    id: string,
    accelerator?: string,
  ): DesktopMenuItem => ({
    item: { label, id, accelerator, enabled: true },
  });

  return [
    {
      submenu: {
        label: "File",
        items: [
          item("New Note", "new-note", "CmdOrCtrl+N"),
          item("New From Template…", "new-template", "CmdOrCtrl+Shift+N"),
          item("Save", "save", "CmdOrCtrl+S"),
          "separator" as DesktopMenuItem,
          item("Add Collection…", "add-collection", "CmdOrCtrl+O"),
          item("Settings", "open-settings", "CmdOrCtrl+,"),
          "separator" as DesktopMenuItem,
          { role: { role: "quit" } },
        ],
      },
    },
    {
      submenu: {
        label: "Edit",
        items: [
          { role: { role: "undo" } },
          { role: { role: "redo" } },
          "separator" as DesktopMenuItem,
          { role: { role: "cut" } },
          { role: { role: "copy" } },
          { role: { role: "paste" } },
          { role: { role: "selectAll" } },
        ],
      },
    },
    {
      submenu: {
        label: "View",
        items: [
          item("Knowledge Graph", "view-graph", "CmdOrCtrl+G"),
          item("Git Panel", "view-git"),
          item("Publishing", "view-publish"),
          item("AI Assistant", "view-ai"),
          "separator" as DesktopMenuItem,
          item("Reload Index", "reload-index", "CmdOrCtrl+R"),
        ],
      },
    },
    {
      submenu: {
        label: "AI",
        items: [
          item("Summarise", "ai-summarize"),
          item("Critique", "ai-critique"),
          item("Research Brief", "ai-research"),
          item("Draft From Notes", "ai-draft"),
          item("Continue Writing", "ai-continue"),
          item("Rewrite Selection", "ai-rewrite"),
        ],
      },
    },
    {
      submenu: {
        label: "Publish",
        items: [
          item("Sync to Astro Site", "pub-sync"),
          item("Build Site", "pub-build"),
          item("Deploy", "pub-deploy"),
        ],
      },
    },
  ];
}

export async function setupDesktop(svc: CambiumService): Promise<void> {
  const BrowserWindow = browserWindowCtor();
  if (!BrowserWindow) return;

  const geo = await loadGeometry();
  // First construction adopts the startup window.
  const win: DesktopWindow = new BrowserWindow({
    title: "Cambium",
    width: geo.width ?? 1400,
    height: geo.height ?? 900,
    x: geo.x,
    y: geo.y,
  });
  win.setTitle(`Cambium — ${svc.version()}`);
  win.setApplicationMenu(appMenu());

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const persistGeometry = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void Deno.writeTextFile(
        GEOMETRY_FILE(),
        JSON.stringify({
          width: win.getSize()[0],
          height: win.getSize()[1],
          x: win.getPosition()[0],
          y: win.getPosition()[1],
        }),
      ).catch(() => undefined);
    }, 400);
  };
  win.addEventListener("resize", persistGeometry);
  win.addEventListener("move", persistGeometry);

  // Forward native menu clicks into the webview as DOM CustomEvents so the
  // React app handles menu items and in-page buttons with one code path.
  win.addEventListener("menuclick", (e) => {
    const id = (e as CustomEvent<{ id: string }>).detail?.id ?? "";
    const detail = JSON.stringify({ id });
    void win.executeJs(
      `window.dispatchEvent(new CustomEvent('cambium:menu', {detail: ${detail}}))`,
    ).catch(() => undefined);
  });

  registerBindings(win, svc);

  svc.notify = (event: string, detail?: unknown) => {
    if (win.isClosed()) return;
    const payload = JSON.stringify(detail ?? {});
    void win.executeJs(
      `window.dispatchEvent(new CustomEvent('cambium:${event}', {detail: ${payload}}))`,
    ).catch(() => undefined);
  };
}
