import { completion, configure } from "../src/index.js";

configure({
  providers: {
    "gpt-4o": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
  },
});

const response = await completion({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello from liteLLM-ts quickstart" }],
});

console.log(response.choices[0]?.message.content);
