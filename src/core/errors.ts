export class SDKError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    options?: { statusCode?: number; retryable?: boolean; details?: unknown },
  ) {
    super(message);
    this.name = "SDKError";
    this.code = code;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
}

export class RateLimitError extends SDKError {
  constructor(message = "Rate limit exceeded", details?: unknown) {
    super("RATE_LIMIT_EXCEEDED", message, { statusCode: 429, retryable: true, details });
    this.name = "RateLimitError";
  }
}

export class BudgetExceededError extends SDKError {
  constructor(message = "Budget exceeded", details?: unknown) {
    super("BUDGET_EXCEEDED", message, { statusCode: 402, retryable: false, details });
    this.name = "BudgetExceededError";
  }
}

export class ProviderError extends SDKError {
  constructor(message: string, details?: unknown, retryable = true, statusCode?: number) {
    super("PROVIDER_ERROR", message, { statusCode, retryable, details });
    this.name = "ProviderError";
  }
}
