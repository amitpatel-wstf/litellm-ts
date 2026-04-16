import type { CompletionRequest, ProviderConfig } from "../core/types.js";
import { OpenAICompatibleAdapter } from "./openai-compatible.js";

export class AzureOpenAIAdapter extends OpenAICompatibleAdapter {
  constructor(config: ProviderConfig) {
    super({
      ...config,
      provider: "azure_openai",
      headers: {
        "api-key": config.apiKey ?? "",
        ...config.headers,
      },
    });
  }

  override async completion(req: CompletionRequest) {
    if (!this.config.baseURL || !this.config.deploymentName || !this.config.apiVersion) {
      throw new Error("Azure OpenAI requires baseURL, deploymentName, and apiVersion");
    }

    const adapter = new OpenAICompatibleAdapter({
      ...this.config,
      baseURL: `${this.config.baseURL}/openai/deployments/${this.config.deploymentName}`,
      headers: {
        ...this.config.headers,
      },
    });

    return adapter.completion({
      ...req,
      model: this.config.deploymentName,
      metadata: {
        ...(req.metadata ?? {}),
        apiVersion: this.config.apiVersion,
      },
    });
  }
}
