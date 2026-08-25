import { AI_COMMANDS, systemPrompt } from "../src-core/ai/commands.ts";
import type { AiContextBundle } from "../src-core/ai/commands.ts";
import type { CambiumService } from "./services.ts";
import { METHODS } from "./methods.ts";

export async function handleApi(
  req: Request,
  svc: CambiumService,
): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }
  try {
    if (url.pathname === "/api/ai/stream" && req.method === "POST") {
      return await handleAiStream(req, svc);
    }
    const m = /^\/api\/rpc\/([\w.]+)$/.exec(url.pathname);
    if (m && req.method === "POST") {
      const handler = METHODS[m[1]];
      if (!handler) {
        return cors(json({ error: `Unknown method: ${m[1]}` }, 404));
      }
      const args = await req.json().catch(() => ({}));
      const result = await handler(svc, args);
      return cors(json({ result }));
    }
    return cors(json({ error: "Not found" }, 404));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api]", message);
    return cors(json({ error: message }, 400));
  }
}

interface AiStreamBody {
  providerId: string;
  commandId: string;
  promptOverride?: string;
  context: {
    title: string;
    frontMatterYaml?: string;
    body?: string;
    selection?: string;
    backlinks?: { title: string; excerpt: string }[];
  };
}

async function handleAiStream(
  req: Request,
  svc: CambiumService,
): Promise<Response> {
  const body = (await req.json()) as AiStreamBody;
  const provider = svc.settings.aiProviders.find((p) =>
    p.id === body.providerId
  );
  if (!provider) throw new Error(`Unknown AI provider: ${body.providerId}`);

  const bundle: AiContextBundle = {
    title: body.context.title ?? "Untitled",
    frontMatterYaml: body.context.frontMatterYaml ?? "",
    body: body.context.body ?? "",
    selection: body.context.selection,
    backlinks: body.context.backlinks,
  };
  const command = AI_COMMANDS[body.commandId as keyof typeof AI_COMMANDS];
  if (!command) throw new Error(`Unknown AI command: ${body.commandId}`);
  const userMessage = body.promptOverride?.trim() || command.buildUser(bundle);

  const { createClient } = await import("../src-core/ai/providers.ts");
  const client = createClient(provider);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        send({ role: "user", echo: userMessage });
        const text = await client.stream(
          {
            messages: [
              { role: "system", content: systemPrompt() },
              { role: "user", content: userMessage },
            ],
          },
          { onDelta: (d) => send({ delta: d }) },
        );
        send({ done: true, text });
      } catch (e) {
        send({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.enqueue(enc.encode("data: [END]\n\n"));
        controller.close();
      }
    },
  });

  return cors(
    new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    }),
  );
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

function cors(res: Response): Response {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "content-type");
  return res;
}
