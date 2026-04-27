import { configure } from "../src/index.js";

configure({
  providers: {
    "gpt-4o": { provider: "openai", apiKey: process.env.OPENAI_API_KEY },
    "claude-3-5-sonnet": {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      apiVersion: "2023-06-01",
    },
    "gemini-1.5-pro": {
      provider: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/models",
    },
    "gpt-4o-azure": {
      provider: "azure_openai",
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: process.env.AZURE_OPENAI_BASE_URL,
      deploymentName: process.env.AZURE_DEPLOYMENT_NAME,
      apiVersion: "2024-02-15-preview",
    },
    "proxy-gpt-4": {
      provider: "proxy",
      apiKey: process.env.LITELLM_PROXY_KEY,
      baseURL: process.env.LITELLM_PROXY_URL,
    },
  },
});

console.log("Providers configured.");
