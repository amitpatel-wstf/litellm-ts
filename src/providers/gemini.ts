import { ProviderError } from "../core/errors.js";
import type { ProviderAdapter } from "../core/interfaces.js";
import type {
  CompletionRequest,
  CompletionResponse,
  ProviderConfig,
  StreamingChunk,
  StreamingResponse,
  ToolDefinition,
} from "../core/types.js";

function mapMessages(messages: CompletionRequest["messages"]) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }],
    }));
}

function mapTools(tools?: ToolDefinition[]): Record<string, unknown>[] | undefined {
  if (!tools?.length) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];
}

async function* parseSSE(response: Response): AsyncIterable<Record<string, unknown>> {
  if (!response.body) throw new ProviderError("Missing Gemini stream body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = event
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("data:"));
      if (data) {
        const raw = data.replace("data:", "").trim();
        if (raw === "[DONE]") return;
        try {
          yield JSON.parse(raw) as Record<string, unknown>;
        } catch {
          // noop
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export class GeminiAdapter implements ProviderAdapter {
  readonly name = "gemini";

  constructor(public readonly config: ProviderConfig) {}

  supportsModel(model: string): boolean {
    return model.includes("gemini");
  }

  private buildURL(model: string, stream = false): string {
    const base = this.config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta/models";
    const endpoint = stream ? `:streamGenerateContent?alt=sse` : `:generateContent`;
    return `${base}/${model}${endpoint}`;
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-goog-api-key": this.config.apiKey ?? "",
      ...this.config.headers,
    };
  }

  private body(req: CompletionRequest, stream: boolean): Record<string, unknown> {
    const system = req.messages.find((m) => m.role === "system")?.content;
    return {
      contents: mapMessages(req.messages),
      systemInstruction: system ? { role: "system", parts: [{ text: system }] } : undefined,
      tools: mapTools(req.tools as ToolDefinition[] | undefined),
      generationConfig: {
        temperature: req.temperature,
        topP: req.topP,
        maxOutputTokens: req.maxTokens,
        responseMimeType: req.responseFormat?.type === "json_object" ? "application/json" : "text/plain",
      },
      toolConfig:
        req.toolChoice === "none"
          ? { functionCallingConfig: { mode: "NONE" } }
          : req.toolChoice === "auto"
            ? { functionCallingConfig: { mode: "AUTO" } }
            : req.toolChoice
              ? { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [req.toolChoice.function.name] } }
              : undefined,
      safetySettings: [],
      stream,
    };
  }

  async completion(req: CompletionRequest): Promise<CompletionResponse> {
    const response = await fetch(this.buildURL(req.model), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.body(req, false)),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 60_000),
    });

    if (!response.ok) {
      throw new ProviderError(`Gemini request failed: ${response.status}`, await response.text(), response.status >= 500, response.status);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const candidates = (payload.candidates as Array<Record<string, unknown>> | undefined) ?? [];
    const first = candidates[0] ?? {};
    const content = (first.content as Record<string, unknown> | undefined) ?? {};
    const parts = (content.parts as Array<Record<string, unknown>> | undefined) ?? [];
    const text = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
    const usage = (payload.usageMetadata as Record<string, unknown> | undefined) ?? {};
    const promptTokens = Number(usage.promptTokenCount ?? 0);
    const completionTokens = Number(usage.candidatesTokenCount ?? 0);

    return {
      id: crypto.randomUUID(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: req.model,
      provider: this.name,
      choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content: text } }],
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  stream(req: CompletionRequest): StreamingResponse {
    const self = this;
    async function* generator(): AsyncIterable<StreamingChunk> {
      const response = await fetch(self.buildURL(req.model, true), {
        method: "POST",
        headers: self.headers(),
        body: JSON.stringify(self.body(req, true)),
        signal: AbortSignal.timeout(self.config.timeoutMs ?? 60_000),
      });

      if (!response.ok) {
        throw new ProviderError(`Gemini streaming failed: ${response.status}`, await response.text(), response.status >= 500, response.status);
      }

      for await (const event of parseSSE(response)) {
        const candidates = (event.candidates as Array<Record<string, unknown>> | undefined) ?? [];
        const first = candidates[0] ?? {};
        const content = (first.content as Record<string, unknown> | undefined) ?? {};
        const parts = (content.parts as Array<Record<string, unknown>> | undefined) ?? [];
        const text = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");

        yield {
          id: String(event.responseId ?? "stream"),
          model: req.model,
          delta: { role: "assistant", content: text },
          done: Boolean(first.finishReason),
        };
      }
    }
    return generator();
  }
}
