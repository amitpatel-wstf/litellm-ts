import { LiteLLMTS } from "./core/sdk.js";
import type {
  CompletionRequest,
  CompletionResponse,
  ProviderConfig,
  SDKOptions,
  StreamingResponse,
} from "./core/types.js";

export * from "./core/types.js";
export * from "./core/errors.js";
export * from "./core/sdk.js";
export * from "./core/suggestions.js";
export * from "./cache/in-memory-cache.js";
export * from "./cache/redis-cache.js";
export * from "./observability/debug-sink.js";

let defaultSDK: LiteLLMTS | undefined;

function defaultProvidersFromEnv(): Record<string, ProviderConfig> {
  const providers: Record<string, ProviderConfig> = {};
  if (process.env.OPENAI_API_KEY) {
    providers["gpt-4"] = { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
    providers["gpt-3.5-turbo"] = { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    providers["claude-3-5-sonnet"] = { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.GEMINI_API_KEY) {
    providers["gemini-1.5-pro"] = {
      provider: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      headers: { authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
    };
  }
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_BASE_URL && process.env.AZURE_DEPLOYMENT_NAME) {
    providers[process.env.AZURE_DEPLOYMENT_NAME] = {
      provider: "azure_openai",
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: process.env.AZURE_OPENAI_BASE_URL,
      deploymentName: process.env.AZURE_DEPLOYMENT_NAME,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-02-15-preview",
    };
  }
  return providers;
}

export function configure(options?: Partial<SDKOptions>): LiteLLMTS {
  const providers = options?.providers ?? defaultProvidersFromEnv();
  defaultSDK = new LiteLLMTS({ providers, ...options } as SDKOptions);
  return defaultSDK;
}

function getSDK(): LiteLLMTS {
  if (!defaultSDK) defaultSDK = configure();
  return defaultSDK;
}

export async function completion<T extends CompletionResponse = CompletionResponse>(
  req: CompletionRequest,
): Promise<T> {
  return getSDK().completion<T>(req);
}

export function stream(req: CompletionRequest): StreamingResponse {
  return getSDK().stream(req);
}
