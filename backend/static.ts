const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

// Project root (this file lives in backend/, dist/ sits next to main.ts).
const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

/**
 * Where the built UI bundle may live, in priority order:
 * 1. ./dist relative to the process cwd (packaged binaries launched from
 *    the project directory)
 * 2. next to the source tree (plain `deno run` from any cwd) and files
 *    embedded via `deno desktop --include dist`
 */
let resolvedDist: string | null = null;

async function resolveDistDir(): Promise<string | null> {
  if (resolvedDist) return resolvedDist;
  const candidates = [`${Deno.cwd()}/dist`, `${SOURCE_ROOT}dist`];
  for (const dir of candidates) {
    try {
      if ((await Deno.stat(`${dir}/index.html`)).isFile) {
        resolvedDist = dir;
        return dir;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function serveStatic(url: URL): Promise<Response> {
  const dist = await resolveDistDir();
  if (!dist) {
    return new Response(
      `<h1>Cambium</h1><p>UI bundle not found. Run <code>deno task build</code>,
       or use <code>deno task dev</code> for the browser dev server.</p>`,
      { status: 404, headers: { "content-type": "text/html" } },
    );
  }

  let relPath = decodeURIComponent(url.pathname);
  if (relPath.endsWith("/")) relPath += "index.html";
  const candidate = `${dist}${relPath.replace(/\.\./g, "")}`;

  try {
    const stat = await Deno.stat(candidate);
    if (stat.isFile) {
      const body = await Deno.readFile(candidate);
      return new Response(body, {
        headers: {
          "content-type": MIME[candidate.slice(candidate.lastIndexOf("."))] ??
            "application/octet-stream",
          "cache-control": "no-cache",
        },
      });
    }
  } catch {
    // fall through to SPA fallback
  }

  // SPA fallback: any unknown route gets the app shell.
  const index = await Deno.readFile(`${dist}/index.html`);
  return new Response(index, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
