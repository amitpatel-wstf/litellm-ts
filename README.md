# LiteLLM TypeScript SDK

Production-grade Node.js (TypeScript) SDK that brings Python LiteLLM capabilities to JavaScript runtimes with a unified completion API, provider abstraction, routing, retries, caching, observability, and budget governance.

---

## 1) Introduction

`litellm-ts` is a TypeScript-first SDK for building multi-provider LLM systems with one interface.

### Why this SDK
- Unified interface across OpenAI, Gemini, Anthropic, Azure OpenAI, and LiteLLM proxy.
- OpenAI-compatible request/response shape for easy adoption.
- Production control planes: retries, fallbacks, routing, cache, budgets, and rate limits.
- Middleware pipeline for policy and cross-cutting concerns.

### Python LiteLLM vs TypeScript SDK

| Capability | Python LiteLLM | `litellm-ts` |
|---|---:|---:|
| Unified completion API | ✅ | ✅ |
| OpenAI-compatible API | ✅ | ✅ |
| Multi-provider routing | ✅ | ✅ |
| Fallbacks + retries | ✅ | ✅ |
| Streaming support | ✅ | ✅ |
| In-memory cache | ✅ | ✅ |
| Redis cache | ✅ | ✅ |
| Budget / cost tracking | ✅ | ✅ |
| Per-user/model rate limiting | ✅ | ✅ |
| Middleware hooks | ⚠️ (plugin patterns) | ✅ (Express-style) |
| LiteLLM proxy client compatibility | ✅ | ✅ |

---

## 2) Installation

```bash
npm install litellm-ts
```

### Environment setup

```bash
export OPENAI_API_KEY="..."
export ANTHROPIC_API_KEY="..."
export GEMINI_API_KEY="..."

# Azure (optional)
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_BASE_URL="https://<resource>.openai.azure.com"
export AZURE_DEPLOYMENT_NAME="gpt-4o-deployment"
export AZURE_OPENAI_API_VERSION="2024-02-15-preview"

# LiteLLM proxy (optional)
export LITELLM_PROXY_URL="http://localhost:4000/v1"
export LITELLM_PROXY_KEY="..."
```

---

## 3) Quick Start

```ts
import { completion } from "litellm-ts";

const response = await completion({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

console.log(response.choices[0]?.message.content);
```

---

## 4) Core API Design

```ts
export interface CompletionRequest<TTools = ToolDefinition[]> {
  model: string;
  messages: Message[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  responseFormat?: { type: "text" | "json_object" };
  tools?: TTools;
  toolChoice?: "none" | "auto" | { type: "function"; function: { name: string } };
  cache?: boolean;
  cacheTTL?: number;
  routing?: RoutingConfig;
  fallbacks?: string[];
  retryPolicy?: RetryPolicy;
  budget?: BudgetConfig;
}

export interface CompletionResponse<TMessage = Message> {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  provider: string;
  choices: Choice<TMessage>[];
  usage: Usage;
  cost?: CostBreakdown;
  latencyMs?: number;
  fromCache?: boolean;
}

export type StreamingResponse = AsyncIterable<StreamingChunk>;

export interface ProviderConfig {
  provider: "openai" | "anthropic" | "gemini" | "azure_openai" | "proxy";
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}
```

---

## 5) Supported Providers

```ts
import { configure } from "litellm-ts";

configure({
  providers: {
    "gpt-4": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
    "gemini-1.5-pro": { provider: "gemini", apiKey: process.env.GEMINI_API_KEY },
    "claude-3-5-sonnet": { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY },
    "gpt-4o-azure": {
      provider: "azure_openai",
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: process.env.AZURE_OPENAI_BASE_URL,
      deploymentName: process.env.AZURE_DEPLOYMENT_NAME,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    },
  },
});
```

---

## 6) Unified Completion API


### Provider-specific tool mapping

The SDK now applies provider-native tool/function payload translation automatically:
- OpenAI / Azure OpenAI: `tools: [{type:"function", function:{...}}]`
- Anthropic: `tools: [{name, description, input_schema}]` + `tool_choice` normalization
- Gemini: `tools: [{ functionDeclarations: [...] }]` + `toolConfig.functionCallingConfig`

### Provider-native streaming

Streaming is implemented with SSE parsers per provider:
- OpenAI-compatible chunk parser (`data: {...}` + `[DONE]`)
- Anthropic `event:` + `data:` parser (`content_block_delta`, `message_stop`)
- Gemini SSE parser for `streamGenerateContent?alt=sse`


### Basic completion

```ts
import { completion } from "litellm-ts";

const res = await completion({
  model: "gpt-4",
  messages: [{ role: "user", content: "Summarize TLS in 2 lines." }],
});
```

### Chat completion

```ts
await completion({
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are concise." },
    { role: "user", content: "Explain CAP theorem." },
  ],
});
```

### Streaming

```ts
import { stream } from "litellm-ts";

for await (const chunk of stream({
  model: "gpt-4",
  messages: [{ role: "user", content: "Write a short poem." }],
  stream: true,
})) {
  process.stdout.write(chunk.delta.content ?? "");
}
```

### Function / tool calling

```ts
const weatherTool = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get weather by city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
} as const;

await completion({
  model: "gpt-4",
  messages: [{ role: "user", content: "What's weather in NYC?" }],
  tools: [weatherTool],
  toolChoice: "auto",
});
```

---

## 7) Caching Layer (Important)

### In-memory cache

```ts
import { InMemoryCache, LiteLLMTS } from "litellm-ts";

const sdk = new LiteLLMTS({ providers: { "gpt-4": { provider: "openai", apiKey: process.env.OPENAI_API_KEY } } }, new InMemoryCache());
```

### Redis cache

```ts
import Redis from "ioredis";
import { RedisCache, LiteLLMTS } from "litellm-ts";

const redis = new Redis(process.env.REDIS_URL!);
const sdk = new LiteLLMTS(
  { providers: { "gpt-4": { provider: "openai", apiKey: process.env.OPENAI_API_KEY } } },
  new RedisCache(redis),
);
```

### Cache key strategy
- Deterministic hash across `{model, messages, tools}`.
- Stable object serialization ensures key consistency.
- TTL supported per request (`cacheTTL`) or via store defaults.

```ts
await sdk.completion({
  model: "gpt-4",
  messages,
  cache: true,
  cacheTTL: 60,
});
```

---

## 8) Routing System

Supported strategies:
- `round_robin`
- `priority`
- `lowest_cost`

```ts
await completion({
  model: "gpt-4",
  messages,
  routing: {
    strategy: "lowest_cost",
    models: ["gpt-4", "gemini-1.5-pro"],
  },
});
```

---

## 9) Fallbacks & Retries

```ts
await completion({
  model: "gpt-4",
  messages,
  fallbacks: ["gpt-3.5-turbo"],
  retryPolicy: {
    maxRetries: 3,
    baseDelayMs: 200,
    maxDelayMs: 2000,
  },
});
```

Behavior:
1. Retry chosen model with exponential backoff.
2. If exhausted, switch to fallback models in order.

---

## 10) Budget & Cost Tracking

```ts
await completion({
  model: "gpt-4",
  messages,
  budget: {
    maxTokens: 10_000,
    maxCost: 1.0,
  },
});
```

SDK tracks:
- request token usage
- estimated request cost
- cumulative ledger enforcement

---

## 11) Rate Limiting

```ts
import { LiteLLMTS } from "litellm-ts";

const sdk = new LiteLLMTS({
  providers: { "gpt-4": { provider: "openai", apiKey: process.env.OPENAI_API_KEY } },
  rateLimit: {
    userPerMinute: 30,
    modelPerMinute: 300,
  },
});
```

Per-user key: `user:<userId>`

Per-model key: `model:<model>`

---

## 12) Logging & Observability

### Built-in logs
- request success/failure
- latency
- usage + estimated cost
- cache hit visibility

### OpenTelemetry-friendly hooks

```ts
const telemetry = {
  startSpan(name: string, attrs?: Record<string, unknown>) {
    const start = performance.now();
    return {
      end() {
        console.log("span", name, attrs, performance.now() - start);
      },
    };
  },
};
```

Pass `telemetry` in `configure()` or `new LiteLLMTS()`.

---

## 13) Middleware System

```ts
import { LiteLLMTS } from "litellm-ts";

sdk.use(async (req, next) => {
  console.log("request", req.model, req.user);
  const res = await next();
  console.log("response", res.usage.totalTokens);
  return res;
});
```

Use middleware for:
- tenancy policies
- custom auth checks
- redaction
- audit trails

---

## 14) Error Handling

Structured errors:
- `SDKError`
- `ProviderError`
- `RateLimitError`
- `BudgetExceededError`

```ts
try {
  await completion({ model: "gpt-4", messages });
} catch (err) {
  if (err instanceof Error) {
    console.error(err.name, err.message);
  }
}
```

Retryability classification exists in error metadata (`retryable`).

---

## 15) Proxy Compatibility

### Connect to LiteLLM proxy

```ts
configure({
  providers: {
    "gpt-4": {
      provider: "proxy",
      baseURL: process.env.LITELLM_PROXY_URL,
      apiKey: process.env.LITELLM_PROXY_KEY,
    },
  },
});
```

Because proxy is OpenAI-compatible, no API-level changes are required.

---

## 16) Advanced Features

### JSON mode

```ts
await completion({
  model: "gpt-4o",
  messages,
  responseFormat: { type: "json_object" },
});
```

### Parallel requests

```ts
const [a, b] = await Promise.all([
  completion({ model: "gpt-4", messages: [{ role: "user", content: "A" }] }),
  completion({ model: "gpt-4", messages: [{ role: "user", content: "B" }] }),
]);
```

### Batching helper pattern

```ts
async function batchPrompts(prompts: string[]) {
  return Promise.all(
    prompts.map((p) =>
      completion({ model: "gpt-4", messages: [{ role: "user", content: p }], cache: true }),
    ),
  );
}
```

---

## 17) Architecture Design

Flow:
1. Request enters middleware pipeline.
2. Budget + rate limit checks.
3. Model resolution via routing engine.
4. Cache lookup.
5. Provider execution with retries.
6. Fallback cascade if needed.
7. Cost estimation + ledger update.
8. Response log + telemetry span close.

Layers:
- `providers/`: provider adapters and protocol normalization
- `router/`: route strategy engine
- `cache/`: cache abstractions/stores
- `rate-limit/`: fixed-window limiter
- `budget/`: budget ledger & policy
- `middleware/`: composable interception chain

---

## 18) Folder Structure

```txt
src/
  budget/
  cache/
  core/
  middleware/
  observability/
  providers/
  rate-limit/
  router/
  utils/
examples/
docs/
```

---

## Example codebase (`examples/`)

- `quickstart.ts` - minimal setup + single completion call.
- `provider-configs.ts` - all provider config patterns (OpenAI, Anthropic, Gemini, Azure, Proxy).
- `streaming.ts` - token streaming loop.
- `middleware-routing-cache.ts` - middleware + routing + cache + fallback + retries.
- `debug-and-suggestions.ts` - debug traces and library suggestions.
- `end-to-end.ts` - full production-style sample with Redis cache.

---

## 19) End-to-End Example

```ts
import Redis from "ioredis";
import { LiteLLMTS, RedisCache } from "litellm-ts";

const redis = new Redis(process.env.REDIS_URL!);

const sdk = new LiteLLMTS(
  {
    providers: {
      "gpt-4": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
      "gpt-3.5-turbo": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
      "gemini-1.5-pro": { provider: "gemini", apiKey: process.env.GEMINI_API_KEY },
    },
    rateLimit: { userPerMinute: 60, modelPerMinute: 1000 },
    globalBudget: { maxTokens: 100_000, maxCost: 20 },
  },
  new RedisCache(redis),
);

sdk.use(async (req, next) => {
  console.log("incoming", req.model, req.user);
  const res = await next();
  console.log("done", res.model, res.cost?.totalCostUsd);
  return res;
});

const response = await sdk.completion({
  model: "gpt-4",
  messages: [{ role: "user", content: "Design a resilient worker queue." }],
  user: "user-123",
  cache: true,
  cacheTTL: 120,
  routing: { strategy: "lowest_cost", models: ["gpt-4", "gemini-1.5-pro"] },
  fallbacks: ["gpt-3.5-turbo"],
  retryPolicy: { maxRetries: 3, baseDelayMs: 250, maxDelayMs: 1500 },
  budget: { maxTokens: 10_000, maxCost: 1 },
});

console.log(response.choices[0]?.message.content);
```

---

## 20) Best Practices

- Set explicit timeout per provider (`timeoutMs`).
- Keep fallback models from different vendors for outage isolation.
- Enable Redis cache in production for process-safe dedupe.
- Tag `user` on every request for per-tenant governance.
- Enforce both token and cost budgets.
- Export logs to centralized sink; attach request IDs in middleware.
- Use proxy mode to centralize secrets and policy controls.

---

## Migration Guide: Python LiteLLM → TypeScript SDK

| Python LiteLLM | `litellm-ts` |
|---|---|
| `litellm.completion(...)` | `completion(...)` |
| `model="gpt-4"` | `model: "gpt-4"` |
| `fallbacks=[...]` | `fallbacks: [...]` |
| `num_retries=3` | `retryPolicy: { maxRetries: 3 }` |
| `cache=True` | `cache: true` |
| Proxy base URL/api key | `provider: "proxy", baseURL, apiKey` |

Migration steps:
1. Replace Python env + model map with `configure({ providers })`.
2. Swap keyword args to typed `CompletionRequest` fields.
3. Move hooks to `sdk.use()` middleware.
4. Add rate limit and budget policy at SDK creation.

---

## Roadmap

- Native SSE token streaming parser per provider.
- Persistent usage ledger backends (Postgres, DynamoDB).
- Circuit breaker and health-based routing.
- Dynamic price feed integration for real-time cost routing.
- Built-in OpenTelemetry exporter wrappers.
- Embeddings, rerank, image generation parity modules.

---

## License

MIT
