import { ProviderError } from "../core/errors.js";
import type { ProviderAdapter } from "../core/interfaces.js";
import type { CompletionRequest, CompletionResponse, ProviderConfig, StreamingChunk, StreamingResponse } from "../core/types.js";

interface OpenAIChatResponse {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
    message: {
      role: "assistant";
      content: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name: string;

  constructor(public readonly config: ProviderConfig) {
    this.name = config.provider;
  }

  supportsModel(): boolean {
    return true;
  }

  async completion(req: CompletionRequest): Promise<CompletionResponse> {
    const baseURL = this.config.baseURL ?? "https://api.openai.com/v1";
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: this.config.apiKey ? `Bearer ${this.config.apiKey}` : "",
        ...this.config.headers,
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 60_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ProviderError(`Provider request failed: ${response.status}`, body, response.status >= 500, response.status);
    }

    const payload = (await response.json()) as OpenAIChatResponse;
    return {
      id: payload.id,
      object: "chat.completion",
      created: payload.created,
      model: payload.model,
      provider: this.name,
      choices: payload.choices.map((c) => ({
        index: c.index,
        finishReason: c.finish_reason,
        message: {
          role: c.message.role,
          content: c.message.content,
        },
      })),
      usage: {
        promptTokens: payload.usage.prompt_tokens,
        completionTokens: payload.usage.completion_tokens,
        totalTokens: payload.usage.total_tokens,
      },
    };
  }

  stream(req: CompletionRequest): StreamingResponse {
    const self = this;
    async function* generator(): AsyncIterable<StreamingChunk> {
      const full = await self.completion({ ...req, stream: false });
      yield {
        id: full.id,
        model: full.model,
        delta: { role: "assistant", content: full.choices[0]?.message.content ?? "" },
        done: true,
        usage: full.usage,
      };
    }
    return generator();
  }
}
