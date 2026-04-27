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

interface OpenAIChatChoice {
  index: number;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
}

interface OpenAIChatResponse {
  id: string;
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function withAuthHeaders(config: ProviderConfig): Record<string, string> {
  if (config.provider === "azure_openai") {
    return {
      "api-key": config.apiKey ?? "",
      ...config.headers,
    };
  }

  return {
    authorization: config.apiKey ? `Bearer ${config.apiKey}` : "",
    ...config.headers,
  };
}

function mapTools(tools?: ToolDefinition[]): ToolDefinition[] | undefined {
  if (!tools) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

async function* parseSSE(response: Response): AsyncIterable<Record<string, unknown>> {
  if (!response.body) {
    throw new ProviderError("Missing streaming response body", undefined, true, response.status);
  }

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

      const dataLines = event
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, ""));

      for (const line of dataLines) {
        if (line === "[DONE]") return;
        try {
          yield JSON.parse(line) as Record<string, unknown>;
        } catch {
          // ignore non-json keep-alives
        }
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name: string;

  constructor(public readonly config: ProviderConfig) {
    this.name = config.provider;
  }

  supportsModel(): boolean {
    return true;
  }

  protected buildURL(path: string): string {
    const baseURL = this.config.baseURL ?? "https://api.openai.com/v1";
    return `${baseURL}${path}`;
  }

  protected buildBody(req: CompletionRequest): Record<string, unknown> {
    return {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      top_p: req.topP,
      max_tokens: req.maxTokens,
      stop: req.stop,
      response_format: req.responseFormat,
      tools: mapTools(req.tools as ToolDefinition[] | undefined),
      tool_choice: req.toolChoice,
      user: req.user,
      stream: req.stream,
    };
  }

  async completion(req: CompletionRequest): Promise<CompletionResponse> {
    const response = await fetch(this.buildURL("/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...withAuthHeaders(this.config),
      },
      body: JSON.stringify(this.buildBody({ ...req, stream: false })),
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
          content: c.message.content ?? "",
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
      const response = await fetch(self.buildURL("/chat/completions"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...withAuthHeaders(self.config),
        },
        body: JSON.stringify(self.buildBody({ ...req, stream: true })),
        signal: AbortSignal.timeout(self.config.timeoutMs ?? 60_000),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ProviderError(`Provider streaming failed: ${response.status}`, body, response.status >= 500, response.status);
      }

      for await (const event of parseSSE(response)) {
        const id = String(event.id ?? "stream");
        const model = String(event.model ?? req.model);
        const choices = Array.isArray(event.choices) ? event.choices : [];
        const first = choices[0] as Record<string, unknown> | undefined;
        const delta = (first?.delta as Record<string, unknown> | undefined) ?? {};
        const finishReason = first?.finish_reason;

        yield {
          id,
          model,
          delta: {
            role: (delta.role as "assistant" | undefined) ?? "assistant",
            content: typeof delta.content === "string" ? delta.content : "",
          },
          done: finishReason !== null && finishReason !== undefined,
        };
      }
    }
    return generator();
  }
}
