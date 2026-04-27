import type { ProviderConfig } from "../core/types.js";
import { OpenAICompatibleAdapter } from "./openai-compatible.js";

export class AzureOpenAIAdapter extends OpenAICompatibleAdapter {
  constructor(config: ProviderConfig) {
    super({
      ...config,
      provider: "azure_openai",
    });
  }

  protected override buildURL(path: string): string {
    if (!this.config.baseURL || !this.config.deploymentName) {
      throw new Error("Azure OpenAI requires baseURL and deploymentName");
    }
    const apiVersion = this.config.apiVersion ?? "2024-02-15-preview";
    return `${this.config.baseURL}/openai/deployments/${this.config.deploymentName}${path}?api-version=${apiVersion}`;
  }
}
