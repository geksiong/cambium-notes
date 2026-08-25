import type { ThemePreference } from "../../src-core/types.ts";

export const THEME_PREF_KEY = "cambium:theme";

const scheme = window.matchMedia("(prefers-color-scheme: light)");

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "auto";
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  return pref === "auto" ? (scheme.matches ? "light" : "dark") : pref;
}

/** Synchronously read the cached preference — used before first paint. */
export function cachedTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_PREF_KEY);
    return isThemePreference(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Apply a preference: resolve "auto" against the OS setting and write the
 * result to <html data-theme>, which styles.css keys off. Also caches the
 * raw preference and dispatches "cambium:theme-changed" whenever the
 * effective theme flips (including live OS switches while in auto mode).
 */
export function applyTheme(pref: ThemePreference): void {
  const resolved = resolveTheme(pref);
  const changed = document.documentElement.dataset.theme !== resolved;
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem(THEME_PREF_KEY, pref);
  } catch {
    // localStorage may be unavailable; theme still applies for this session.
  }
  if (changed) {
    window.dispatchEvent(
      new CustomEvent("cambium:theme-changed", { detail: { pref } }),
    );
  }
}

let listening = false;

/** Keep auto mode live-tracking the OS. Call once at startup. */
export function watchOsScheme(): void {
  if (listening) return;
  listening = true;
  scheme.addEventListener("change", () => {
    applyTheme(cachedTheme());
  });
}
