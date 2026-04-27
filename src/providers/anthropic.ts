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

interface AnthropicContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  model: string;
  role: "assistant";
  content: AnthropicContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "tool_use" | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

function mapAnthropicTools(tools?: ToolDefinition[]): Array<Record<string, unknown>> | undefined {
  if (!tools) return undefined;
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly name = "anthropic";

  constructor(public readonly config: ProviderConfig) {}

  supportsModel(model: string): boolean {
    return model.startsWith("claude");
  }

  private buildHeaders(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.config.apiKey ?? "",
      "anthropic-version": this.config.apiVersion ?? "2023-06-01",
      ...this.config.headers,
    };
  }

  private buildURL(path: string): string {
    return `${this.config.baseURL ?? "https://api.anthropic.com/v1"}${path}`;
  }

  async completion(req: CompletionRequest): Promise<CompletionResponse> {
    const system = req.messages.find((m) => m.role === "system")?.content;
    const response = await fetch(this.buildURL("/messages"), {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature,
        top_p: req.topP,
        system,
        messages: req.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        tools: mapAnthropicTools(req.tools as ToolDefinition[] | undefined),
        tool_choice:
          req.toolChoice && typeof req.toolChoice === "object"
            ? { type: "tool", name: req.toolChoice.function.name }
            : req.toolChoice === "none"
              ? { type: "none" }
              : req.toolChoice === "auto"
                ? { type: "auto" }
                : undefined,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 60_000),
    });

    if (!response.ok) {
      throw new ProviderError(`Anthropic request failed: ${response.status}`, await response.text(), response.status >= 500, response.status);
    }

    const payload = (await response.json()) as AnthropicResponse;
    const text = payload.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");

    return {
      id: payload.id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: payload.model,
      provider: this.name,
      choices: [
        {
          index: 0,
          finishReason:
            payload.stop_reason === "max_tokens"
              ? "length"
              : payload.stop_reason === "tool_use"
                ? "tool_calls"
                : "stop",
          message: { role: "assistant", content: text },
        },
      ],
      usage: {
        promptTokens: payload.usage.input_tokens,
        completionTokens: payload.usage.output_tokens,
        totalTokens: payload.usage.input_tokens + payload.usage.output_tokens,
      },
    };
  }

  stream(req: CompletionRequest): StreamingResponse {
    const self = this;
    async function* generator(): AsyncIterable<StreamingChunk> {
      const system = req.messages.find((m) => m.role === "system")?.content;
      const response = await fetch(self.buildURL("/messages"), {
        method: "POST",
        headers: self.buildHeaders(),
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxTokens ?? 1024,
          messages: req.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
          system,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new ProviderError(
          `Anthropic streaming failed: ${response.status}`,
          await response.text(),
          response.status >= 500,
          response.status,
        );
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = event.split("\n");
          const typeLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          const eventType = typeLine?.replace("event:", "").trim();
          const data = dataLine?.replace("data:", "").trim();

          if (data) {
            const payload = JSON.parse(data) as Record<string, unknown>;
            if (eventType === "content_block_delta") {
              const delta = payload.delta as Record<string, unknown> | undefined;
              const text = typeof delta?.text === "string" ? delta.text : "";
              yield { id: String(payload.message_id ?? "stream"), model: req.model, delta: { role: "assistant", content: text }, done: false };
            }
            if (eventType === "message_stop") {
              yield { id: String(payload.message_id ?? "stream"), model: req.model, delta: { role: "assistant", content: "" }, done: true };
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    }
    return generator();
  }
}
