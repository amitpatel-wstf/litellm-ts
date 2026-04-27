import { InMemoryDebugSink, LiteLLMTS } from "../src/index.js";

const debugSink = new InMemoryDebugSink();

const sdk = new LiteLLMTS({
  providers: {
    "gpt-4o": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
    "gpt-4o-mini": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
  },
  debug: true,
  debugSink,
});

const response = await sdk.completion({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Give me a concise summary of CQRS." }],
  includeSuggestions: true,
  debug: true,
});

console.log("requestId", response.requestId);
console.log("suggestions", response.suggestions);
console.log("trace", debugSink.getTrace(response.requestId));
