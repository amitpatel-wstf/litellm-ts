import type { CostBreakdown, Usage } from "../core/types.js";

const modelPricing: Record<string, { input: number; output: number }> = {
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "gemini-1.5-pro": { input: 0.0035, output: 0.0105 },
  "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
};

export function estimateCost(model: string, usage: Usage): CostBreakdown {
  const pricing = modelPricing[model] ?? { input: 0.01, output: 0.03 };
  const inputCostUsd = (usage.promptTokens / 1000) * pricing.input;
  const outputCostUsd = (usage.completionTokens / 1000) * pricing.output;
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
  };
}
