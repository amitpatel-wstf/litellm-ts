import type { LibrarySuggestion, SuggestionContext, SuggestionEngine } from "./types.js";

export class DefaultSuggestionEngine implements SuggestionEngine {
  suggest(ctx: SuggestionContext): LibrarySuggestion[] {
    const suggestions: LibrarySuggestion[] = [];

    if (ctx.response?.latencyMs && ctx.response.latencyMs > 7_000 && ctx.availableModels.length > 1) {
      const alternative = ctx.availableModels.find((m) => m !== ctx.request.model);
      if (alternative) {
        suggestions.push({
          type: "model",
          reason: `High latency observed (${ctx.response.latencyMs}ms).`,
          recommendation: `Consider routing to ${alternative} for lower latency workloads.`,
          confidence: "medium",
          metadata: { latencyMs: ctx.response.latencyMs },
        });
      }
    }

    if ((ctx.response?.cost?.totalCostUsd ?? 0) > 0.05) {
      suggestions.push({
        type: "config",
        reason: "Request cost is relatively high.",
        recommendation: "Enable routing.strategy='lowest_cost' and add fallbacks for cost-sensitive paths.",
        confidence: "high",
      });
    }

    if (!ctx.request.cache) {
      suggestions.push({
        type: "config",
        reason: "Caching is disabled.",
        recommendation: "Set cache=true and cacheTTL for repeated prompts to reduce cost and latency.",
        confidence: "medium",
      });
    }

    return suggestions;
  }
}
