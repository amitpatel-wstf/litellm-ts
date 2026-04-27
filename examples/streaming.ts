import { configure, stream } from "../src/index.js";

configure({
  providers: {
    "gpt-4o": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
  },
});

for await (const chunk of stream({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Write 4 words about distributed systems." }],
  stream: true,
})) {
  process.stdout.write(chunk.delta.content ?? "");
}
process.stdout.write("\n");
