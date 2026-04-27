import { InMemoryCache, LiteLLMTS } from "../src/index.js";

const sdk = new LiteLLMTS(
  {
    providers: {
      "gpt-4o": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
      "gpt-4o-mini": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
    },
    debug: true,
  },
  new InMemoryCache(),
);

sdk.use(async (req, next) => {
  console.log("Incoming request", { model: req.model, user: req.user });
  const res = await next();
  console.log("Completed request", { model: res.model, latencyMs: res.latencyMs });
  return res;
});

const response = await sdk.completion({
  model: "gpt-4o",
  messages: [{ role: "user", content: "How does Raft leader election work?" }],
  cache: true,
  cacheTTL: 120,
  routing: { strategy: "lowest_cost", models: ["gpt-4o", "gpt-4o-mini"] },
  fallbacks: ["gpt-4o-mini"],
  retryPolicy: { maxRetries: 3 },
  user: "tenant-alpha",
  includeSuggestions: true,
  debug: true,
});

console.log(response.choices[0]?.message.content);
console.log(response.suggestions);
