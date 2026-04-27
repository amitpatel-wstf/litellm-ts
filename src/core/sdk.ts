import { BudgetManager } from "../budget/budget-manager.js";
import { InMemoryCache } from "../cache/in-memory-cache.js";
import { BudgetExceededError, ProviderError, SDKError } from "./errors.js";
import type { CacheStore, Middleware, ProviderAdapter } from "./interfaces.js";
import { composeMiddleware } from "../middleware/compose.js";
import { consoleLogger } from "../observability/console-logger.js";
import { FixedWindowLimiter } from "../rate-limit/token-bucket.js";
import { Router } from "../router/router.js";
import { hashObject } from "../utils/hash.js";
import { estimateCost } from "../utils/cost.js";
import type { CompletionRequest, CompletionResponse, DebugEvent, SDKOptions, StreamingResponse } from "./types.js";
import { AnthropicAdapter } from "../providers/anthropic.js";
import { AzureOpenAIAdapter } from "../providers/azure-openai.js";
import { GeminiAdapter } from "../providers/gemini.js";
import { OpenAICompatibleAdapter } from "../providers/openai-compatible.js";
import { DefaultSuggestionEngine } from "./suggestions.js";

const DEFAULT_RETRY = { maxRetries: 2, baseDelayMs: 200, maxDelayMs: 2_000 };

export class LiteLLMTS {
  private readonly providers = new Map<string, ProviderAdapter>();
  private readonly cache: CacheStore;
  private readonly middleware: Middleware[] = [];
  private readonly logger;
  private readonly telemetry;
  private readonly limiter = new FixedWindowLimiter();
  private readonly budgetManager = new BudgetManager();
  private readonly router: Router;

  constructor(private readonly options: SDKOptions, cache?: CacheStore) {
    this.cache = cache ?? new InMemoryCache();
    this.logger = options.logger ?? consoleLogger;
    this.telemetry = options.telemetry;

    for (const [alias, cfg] of Object.entries(options.providers)) {
      if (cfg.provider === "openai" || cfg.provider === "proxy") {
        this.providers.set(alias, new OpenAICompatibleAdapter(cfg));
      } else if (cfg.provider === "gemini") {
        this.providers.set(alias, new GeminiAdapter(cfg));
      } else if (cfg.provider === "anthropic") {
        this.providers.set(alias, new AnthropicAdapter(cfg));
      } else if (cfg.provider === "azure_openai") {
        this.providers.set(alias, new AzureOpenAIAdapter(cfg));
      }
    }

    this.router = new Router(
      new Map(
        Object.keys(options.providers).map((k, idx) => [
          k,
          { model: k, priority: idx, estimatedInputCostPer1k: 0.01, estimatedOutputCostPer1k: 0.03 },
        ]),
      ),
    );
  }

  use(mw: Middleware): void {
    this.middleware.push(mw);
  }

  async completion<T extends CompletionResponse = CompletionResponse>(req: CompletionRequest): Promise<T> {
    const exec = composeMiddleware(this.middleware, (r) => this.executeCompletion(r));
    return (await exec(req)) as T;
  }

  stream(req: CompletionRequest): StreamingResponse {
    const model = this.resolveModel(req);
    const adapter = this.providers.get(model);
    if (!adapter) throw new SDKError("MODEL_NOT_FOUND", `Model ${model} not configured`);
    return adapter.stream({ ...req, model });
  }

  private emitDebug(
    trace: DebugEvent[],
    enabled: boolean,
    event: DebugEvent,
  ): void {
    if (!enabled) return;
    trace.push(event);
    this.options.debugSink?.emit(event);
    this.logger.debug(`debug.${event.phase}`, {
      requestId: event.requestId,
      model: event.model,
      attempt: event.attempt,
      ...event.details,
    });
  }

  private async executeCompletion(req: CompletionRequest): Promise<CompletionResponse> {
    const requestId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).toString();
    const debugEnabled = req.debug ?? this.options.debug ?? false;
    const debugTrace: DebugEvent[] = [];

    this.emitDebug(debugTrace, debugEnabled, {
      requestId,
      timestamp: Date.now(),
      phase: "request_received",
      model: req.model,
      details: { fallbacks: req.fallbacks ?? [] },
    });

    const span = this.telemetry?.startSpan("litellm.completion", { model: req.model, requestId });
    const start = Date.now();

    const mergedBudget = {
      maxTokens: req.budget?.maxTokens ?? this.options.globalBudget?.maxTokens,
      maxCost: req.budget?.maxCost ?? this.options.globalBudget?.maxCost,
    };
    this.budgetManager.assertWithinBudget(mergedBudget);

    if (this.options.rateLimit?.userPerMinute && req.user) {
      this.limiter.consume(`user:${req.user}`, this.options.rateLimit.userPerMinute);
    }
    if (this.options.rateLimit?.modelPerMinute) {
      this.limiter.consume(`model:${req.model}`, this.options.rateLimit.modelPerMinute);
    }

    const resolvedModel = this.resolveModel(req);
    this.emitDebug(debugTrace, debugEnabled, {
      requestId,
      timestamp: Date.now(),
      phase: "routing_resolved",
      model: resolvedModel,
      details: { routing: req.routing?.strategy ?? "none" },
    });

    const adjustedReq = { ...req, model: resolvedModel };

    const cacheKey = hashObject({ model: adjustedReq.model, messages: adjustedReq.messages, tools: adjustedReq.tools });
    if (req.cache) {
      const hit = await this.cache.get<CompletionResponse>(cacheKey);
      if (hit) {
        this.emitDebug(debugTrace, debugEnabled, {
          requestId,
          timestamp: Date.now(),
          phase: "cache_hit",
          model: adjustedReq.model,
        });
        this.logger.info("cache hit", { model: adjustedReq.model });
        return { ...hit, fromCache: true, requestId, debugTrace: debugEnabled ? debugTrace : undefined };
      }
    }

    const retryPolicy = req.retryPolicy ?? DEFAULT_RETRY;
    let attempts = 0;
    const candidates = [adjustedReq.model, ...(req.fallbacks ?? [])];
    let lastError: unknown;

    for (const model of candidates) {
      const adapter = this.providers.get(model);
      if (!adapter) continue;
      if (model !== adjustedReq.model) {
        this.emitDebug(debugTrace, debugEnabled, {
          requestId,
          timestamp: Date.now(),
          phase: "fallback_switch",
          model,
          details: { from: adjustedReq.model },
        });
      }

      while (attempts <= retryPolicy.maxRetries) {
        this.emitDebug(debugTrace, debugEnabled, {
          requestId,
          timestamp: Date.now(),
          phase: "attempt_start",
          model,
          attempt: attempts + 1,
        });

        try {
          const response = await adapter.completion({ ...adjustedReq, model });
          const cost = estimateCost(model, response.usage);
          response.cost = cost;
          response.latencyMs = Date.now() - start;
          response.requestId = requestId;

          this.budgetManager.addUsage(response.usage, cost.totalCostUsd);
          this.budgetManager.assertWithinBudget(mergedBudget);

          if (req.cache) {
            await this.cache.set(cacheKey, response, req.cacheTTL);
          }

          if (debugEnabled) {
            response.debugTrace = debugTrace;
            this.emitDebug(debugTrace, true, {
              requestId,
              timestamp: Date.now(),
              phase: "response_success",
              model,
              details: { latencyMs: response.latencyMs, costUsd: cost.totalCostUsd },
            });
          }

          if (req.includeSuggestions) {
            const suggestionEngine = this.options.suggestionEngine ?? new DefaultSuggestionEngine();
            response.suggestions = suggestionEngine.suggest({
              request: req,
              response,
              availableModels: [...this.providers.keys()],
            });
          }

          this.logger.info("completion.success", {
            model,
            latencyMs: response.latencyMs,
            usage: response.usage,
            costUsd: cost.totalCostUsd,
            requestId,
          });
          span?.end();
          return response;
        } catch (error) {
          lastError = error;
          const err = error as Error;
          this.emitDebug(debugTrace, debugEnabled, {
            requestId,
            timestamp: Date.now(),
            phase: "attempt_failed",
            model,
            attempt: attempts + 1,
            details: { message: err.message },
          });

          this.logger.warn("completion.attempt_failed", { model, attempts, message: err.message, requestId });
          const retryable = error instanceof ProviderError ? error.retryable : true;
          if (!retryable || attempts >= retryPolicy.maxRetries) break;
          const delay = Math.min(
            (retryPolicy.baseDelayMs ?? 200) * 2 ** attempts,
            retryPolicy.maxDelayMs ?? 2_000,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempts += 1;
        }
      }
      attempts = 0;
    }

    span?.end();
    this.emitDebug(debugTrace, debugEnabled, {
      requestId,
      timestamp: Date.now(),
      phase: "response_error",
      model: req.model,
      details: { error: (lastError as Error | undefined)?.message ?? "unknown" },
    });

    if (lastError instanceof BudgetExceededError) throw lastError;
    throw new SDKError("ALL_MODELS_FAILED", "All models and fallbacks failed", { retryable: false, details: lastError });
  }

  private resolveModel(req: CompletionRequest): string {
    if (req.routing) return this.router.chooseModel(req.routing);
    return req.model || this.options.defaultModel || "";
  }
}
