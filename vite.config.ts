import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  define: {
    // Stamped into the status bar so stale bundles are instantly visible.
    __CAMBIUM_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
