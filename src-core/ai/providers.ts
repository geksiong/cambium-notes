import type { AiProviderConfig } from "../types.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface CompletionChunker {
  onDelta(text: string): void;
}

export interface AiClient {
  /** Non-streaming convenience wrapper. */
  complete(req: CompletionRequest): Promise<string>;
  /** Streams deltas into chunker.onDelta; resolves with the full text. */
  stream(req: CompletionRequest, chunker: CompletionChunker): Promise<string>;
}

const SSE_LINE_RE = /^data:\s?(.*)$/;

async function* sseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).replace(/\r$/, "");
        buf = buf.slice(idx + 1);
        const m = SSE_LINE_RE.exec(line);
        if (m && m[1] !== "[DONE]") yield m[1];
      }
    }
  } finally {
    reader.releaseLock();
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HttpError(
      res.status,
      `AI request failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  return res;
}

function openAiCompatible(cfg: AiProviderConfig): AiClient {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  return {
    async complete(req) {
      let text = "";
      await this.stream(req, { onDelta: (d) => (text += d) });
      return text;
    },
    async stream(req, chunker) {
      const res = await postJson(`${base}/chat/completions`, authHeaders(cfg), {
        model: req.model ?? cfg.model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? 2048,
        temperature: req.temperature ?? 0.7,
        stream: true,
      }, req.signal);
      let full = "";
      for await (const ev of sseEvents(res.body!)) {
        try {
          const json = JSON.parse(ev);
          const delta: string | undefined = json.choices?.[0]?.delta?.content ??
            undefined;
          if (delta) {
            full += delta;
            chunker.onDelta(delta);
          }
        } catch {
          // ignore keepalives / partial lines
        }
      }
      return full;
    },
  };
}

function anthropic(cfg: AiProviderConfig): AiClient {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers = {
    "x-api-key": cfg.apiKey ?? "",
    "anthropic-version": "2023-06-01",
  };
  return {
    async complete(req) {
      let text = "";
      await this.stream(req, { onDelta: (d) => (text += d) });
      return text;
    },
    async stream(req, chunker) {
      const system = req.messages.filter((m) => m.role === "system")
        .map((m) => m.content).join("\n\n");
      const messages = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await postJson(`${base}/v1/messages`, headers, {
        model: req.model ?? cfg.model,
        system: system || undefined,
        messages,
        max_tokens: req.maxTokens ?? 2048,
        temperature: req.temperature ?? 0.7,
        stream: true,
      }, req.signal);
      let full = "";
      for await (const ev of sseEvents(res.body!)) {
        try {
          const json = JSON.parse(ev);
          if (
            json.type === "content_block_delta" &&
            typeof json.delta?.text === "string"
          ) {
            full += json.delta.text;
            chunker.onDelta(json.delta.text);
          }
        } catch {
          // ignore
        }
      }
      return full;
    },
  };
}

function ollama(cfg: AiProviderConfig): AiClient {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  return {
    async complete(req) {
      let text = "";
      await this.stream(req, { onDelta: (d) => (text += d) });
      return text;
    },
    async stream(req, chunker) {
      // Ollama streams NDJSON rather than SSE.
      const res = await postJson(`${base}/api/chat`, {}, {
        model: req.model ?? cfg.model,
        messages: req.messages.map(({ role, content }) => ({ role, content })),
        stream: true,
        options: {
          temperature: req.temperature ?? 0.7,
          num_predict: req.maxTokens ?? 2048,
        },
      }, req.signal);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const json = JSON.parse(line);
            const delta: string | undefined = json.message?.content;
            if (delta) {
              full += delta;
              chunker.onDelta(delta);
            }
          } catch {
            // ignore
          }
        }
      }
      return full;
    },
  };
}

function authHeaders(cfg: AiProviderConfig): Record<string, string> {
  return cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
}

export function createClient(cfg: AiProviderConfig): AiClient {
  switch (cfg.type) {
    case "openai-compatible":
      return openAiCompatible(cfg);
    case "anthropic":
      return anthropic(cfg);
    case "ollama":
      return ollama(cfg);
  }
}
