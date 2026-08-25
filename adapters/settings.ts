import type { AppSettings } from "../src-core/types.ts";

const DEFAULTS: AppSettings = {
  collections: [],
  authorName: "",
  aiProviders: [],
  theme: "auto",
};

export function configDir(): string {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  switch (Deno.build.os) {
    case "darwin":
      return `${home}/Library/Application Support/cambium`;
    case "windows":
      return `${Deno.env.get("APPDATA") ?? home}/cambium`;
    default:
      return `${Deno.env.get("XDG_CONFIG_HOME") ?? `${home}/.config`}/cambium`;
  }
}

function settingsFile(): string {
  return `${configDir()}/settings.json`;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const text = await Deno.readTextFile(settingsFile());
    const parsed = JSON.parse(text);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Atomic write: tmp file + rename in the same directory. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await Deno.mkdir(configDir(), { recursive: true });
  const file = settingsFile();
  const tmp = `${file}.tmp-${crypto.randomUUID()}`;
  await Deno.writeTextFile(tmp, JSON.stringify(settings, null, 2));
  await Deno.rename(tmp, file);
}
