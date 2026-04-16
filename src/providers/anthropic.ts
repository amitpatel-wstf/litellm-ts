import type { CompletionRequest, ProviderConfig } from "../core/types.js";
import { OpenAICompatibleAdapter } from "./openai-compatible.js";

export class AnthropicAdapter extends OpenAICompatibleAdapter {
  constructor(config: ProviderConfig) {
    super({
      ...config,
      provider: "anthropic",
      baseURL: config.baseURL ?? "https://api.anthropic.com/v1",
      headers: {
        "x-api-key": config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
        ...config.headers,
      },
    });
  }

  override async completion(req: CompletionRequest) {
    return super.completion({ ...req, model: req.model.replace("gpt", "claude") });
  }
}
