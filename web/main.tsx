import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { useStore } from "./state/store.ts";
import { applyTheme, cachedTheme, watchOsScheme } from "./state/theme.ts";
import "./styles.css";

// Apply the cached theme before first paint to avoid a flash of the wrong
// palette; persisted settings are reconciled later during bootstrap.
applyTheme(cachedTheme());
watchOsScheme();

// Surface every runtime error in the status bar — silent breakage is the
// worst failure mode a local app can have.
const report = (label: string, e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  console.error(label, e);
  useStore.getState().setStatus(`⚠ ${label}: ${m}`);
};
window.addEventListener("error", (e) => report("error", e.error ?? e.message));
window.addEventListener(
  "unhandledrejection",
  (e) => report("promise", e.reason),
);

createRoot(document.getElementById("root")!).render(<App />);
