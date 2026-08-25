import { handleApi } from "./backend/api.ts";
import { serveStatic } from "./backend/static.ts";
import { CambiumService } from "./backend/services.ts";

const PORT = Number(Deno.env.get("CAMBIUM_PORT") ?? 8787);

const svc = await CambiumService.create();

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return await handleApi(req, svc);
  return await serveStatic(url);
}

// Under `deno desktop` DENO_SERVE_ADDRESS is set by the runtime and the
// passed port is ignored; under plain `deno run` we bind CAMBIUM_PORT.
Deno.serve({ port: PORT }, handler);

const serveAddr = Deno.env.get("DENO_SERVE_ADDRESS") ??
  (PORT ? `tcp:127.0.0.1:${PORT}` : "tcp:127.0.0.1:8787");
console.log(
  `[cambium] serving UI on http://127.0.0.1:${serveAddr.split(":").pop()}/`,
);

const { browserWindowCtor } = await import("./backend/desktop-shim.ts");
if (browserWindowCtor()) {
  const { setupDesktop } = await import("./backend/window.ts");
  await setupDesktop(svc);
}
