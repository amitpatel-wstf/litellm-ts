import type { RoutingConfig } from "../core/types.js";

export interface ModelMeta {
  model: string;
  priority?: number;
  estimatedInputCostPer1k?: number;
  estimatedOutputCostPer1k?: number;
}

export class Router {
  private rrCursor = 0;

  constructor(private readonly modelRegistry: Map<string, ModelMeta>) {}

  chooseModel(config: RoutingConfig): string {
    const candidates = config.models.filter((m) => this.modelRegistry.has(m));
    if (!candidates.length) {
      throw new Error(`No routeable models found in ${config.models.join(",")}`);
    }

    switch (config.strategy) {
      case "round_robin": {
        const choice = candidates[this.rrCursor % candidates.length];
        this.rrCursor += 1;
        return choice;
      }
      case "priority": {
        return candidates
          .map((model) => this.modelRegistry.get(model)!)
          .sort((a, b) => (a.priority ?? 1000) - (b.priority ?? 1000))[0].model;
      }
      case "lowest_cost": {
        return candidates
          .map((model) => this.modelRegistry.get(model)!)
          .sort(
            (a, b) =>
              (a.estimatedInputCostPer1k ?? 100) + (a.estimatedOutputCostPer1k ?? 100) -
              ((b.estimatedInputCostPer1k ?? 100) + (b.estimatedOutputCostPer1k ?? 100)),
          )[0].model;
      }
    }
  }
}
