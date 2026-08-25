/**
 * Transport duality: inside `deno desktop` we use in-process bindings;
 * in a plain browser (dev server or future web target) the identical
 * method table is served over HTTP at /api/rpc/:method.
 */
declare global {
  // Provided by deno desktop inside its webview.
  var bindings:
    | Record<string, (args?: unknown) => Promise<unknown>>
    | undefined;
}

const hasBindings = typeof globalThis.bindings !== "undefined";

export async function rpc<T = unknown>(
  method: string,
  args?: unknown,
): Promise<T> {
  if (hasBindings && globalThis.bindings) {
    return (await globalThis.bindings[method](args)) as T;
  }
  const res = await fetch(`/api/rpc/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  const payload = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok || payload.error) {
    throw new Error(payload.error ?? `RPC ${method} failed`);
  }
  return payload.result as T;
}

export interface AiStreamEvents {
  onEcho?(prompt: string): void;
  onDelta(delta: string): void;
}

export async function aiStream(
  body: Record<string, unknown>,
  events: AiStreamEvents,
): Promise<string> {
  const res = await fetch("/api/ai/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI stream failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  outer:
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[END]") break outer;
      try {
        const evt = JSON.parse(data);
        if (evt.echo && events.onEcho) events.onEcho(evt.echo);
        else if (evt.delta) {
          full += evt.delta;
          events.onDelta(evt.delta);
        } else if (evt.error) throw new Error(evt.error);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return full;
}
