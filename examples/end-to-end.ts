import Redis from "ioredis";
import { LiteLLMTS, RedisCache } from "../src/index.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const sdk = new LiteLLMTS(
  {
    providers: {
      "gpt-4": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
      "gpt-3.5-turbo": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
      "gemini-1.5-pro": {
        provider: "gemini",
        apiKey: process.env.GEMINI_API_KEY,
        headers: { authorization: `Bearer ${process.env.GEMINI_API_KEY ?? ""}` },
      },
    },
    globalBudget: { maxTokens: 100_000, maxCost: 10 },
    rateLimit: { userPerMinute: 60, modelPerMinute: 600 },
  },
  new RedisCache(redis),
);

sdk.use(async (req, next) => {
  const start = Date.now();
  const response = await next();
  console.log({ model: response.model, latencyMs: Date.now() - start, cached: response.fromCache });
  return response;
});

const response = await sdk.completion({
  model: "gpt-4",
  messages: [{ role: "user", content: "Give me 3 SRE incident response tips" }],
  user: "tenant-acme",
  cache: true,
  cacheTTL: 120,
  fallbacks: ["gpt-3.5-turbo", "gemini-1.5-pro"],
  routing: {
    strategy: "lowest_cost",
    models: ["gpt-4", "gemini-1.5-pro"],
  },
  retryPolicy: { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 1500 },
});

console.log(response.choices[0]?.message.content);
await redis.quit();
