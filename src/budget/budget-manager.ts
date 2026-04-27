import { BudgetExceededError } from "../core/errors.js";
import type { BudgetConfig, Usage } from "../core/types.js";

export interface UsageLedger {
  totalTokens: number;
  totalCostUsd: number;
}

export class BudgetManager {
  private readonly ledger: UsageLedger = { totalTokens: 0, totalCostUsd: 0 };

  assertWithinBudget(budget?: BudgetConfig): void {
    if (!budget) return;
    if (budget.maxTokens !== undefined && this.ledger.totalTokens >= budget.maxTokens) {
      throw new BudgetExceededError("Token budget exceeded", { ledger: this.ledger, budget });
    }
    if (budget.maxCost !== undefined && this.ledger.totalCostUsd >= budget.maxCost) {
      throw new BudgetExceededError("Cost budget exceeded", { ledger: this.ledger, budget });
    }
  }

  addUsage(usage: Usage, totalCostUsd: number): void {
    this.ledger.totalTokens += usage.totalTokens;
    this.ledger.totalCostUsd += totalCostUsd;
  }

  snapshot(): UsageLedger {
    return { ...this.ledger };
  }
}
