import type { ProviderConfig } from "../core/types.js";
import { OpenAICompatibleAdapter } from "./openai-compatible.js";

export class GeminiAdapter extends OpenAICompatibleAdapter {
  constructor(config: ProviderConfig) {
    super({
      ...config,
      provider: "gemini",
      baseURL: config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
    });
  }
}
