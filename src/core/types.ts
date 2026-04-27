export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface Message<TContent = string> {
  role: MessageRole;
  content: TContent;
  name?: string;
  toolCallId?: string;
}

export interface ToolDefinition<TParameters = Record<string, unknown>> {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: TParameters;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
}

export interface BudgetConfig {
  maxTokens?: number;
  maxCost?: number;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RoutingConfig {
  strategy: "round_robin" | "priority" | "lowest_cost";
  models: string[];
}

export interface RateLimitConfig {
  userPerMinute?: number;
  modelPerMinute?: number;
}

export interface ProviderConfig {
  provider: "openai" | "anthropic" | "gemini" | "azure_openai" | "proxy";
  apiKey?: string;
  baseURL?: string;
  apiVersion?: string;
  organization?: string;
  deploymentName?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface CompletionRequest<TTools = ToolDefinition[]> {
  model: string;
  messages: Message[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string | string[];
  stream?: boolean;
  responseFormat?: { type: "text" | "json_object" };
  tools?: TTools;
  toolChoice?: "none" | "auto" | { type: "function"; function: { name: string } };
  user?: string;
  metadata?: Record<string, string | number | boolean>;
  cache?: boolean;
  cacheTTL?: number;
  routing?: RoutingConfig;
  fallbacks?: string[];
  retryPolicy?: RetryPolicy;
  budget?: BudgetConfig;
  debug?: boolean;
  includeSuggestions?: boolean;
}

export interface Choice<TMessage = Message> {
  index: number;
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  message: TMessage;
}

export type DebugEventPhase =
  | "request_received"
  | "routing_resolved"
  | "cache_hit"
  | "attempt_start"
  | "attempt_failed"
  | "fallback_switch"
  | "response_success"
  | "response_error";

export interface DebugEvent {
  requestId: string;
  timestamp: number;
  phase: DebugEventPhase;
  model?: string;
  provider?: string;
  attempt?: number;
  details?: Record<string, unknown>;
}

export interface DebugSink {
  emit(event: DebugEvent): void;
}

export interface LibrarySuggestion {
  type: "model" | "provider" | "config";
  reason: string;
  recommendation: string;
  confidence: "low" | "medium" | "high";
  metadata?: Record<string, string | number | boolean>;
}

export interface SuggestionContext {
  request: CompletionRequest;
  response?: Pick<CompletionResponse, "model" | "usage" | "cost" | "latencyMs">;
  availableModels: string[];
}

export interface SuggestionEngine {
  suggest(ctx: SuggestionContext): LibrarySuggestion[];
}

export interface CompletionResponse<TMessage = Message> {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Choice<TMessage>[];
  usage: Usage;
  cost?: CostBreakdown;
  fromCache?: boolean;
  provider: string;
  latencyMs?: number;
  requestId?: string;
  debugTrace?: DebugEvent[];
  suggestions?: LibrarySuggestion[];
}

export interface StreamingChunk {
  id: string;
  model: string;
  delta: Partial<Message>;
  done: boolean;
  usage?: Usage;
}

export type StreamingResponse = AsyncIterable<StreamingChunk>;

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export interface Telemetry {
  startSpan(name: string, attrs?: Record<string, unknown>): { end: () => void };
}

export interface SDKOptions {
  providers: Record<string, ProviderConfig>;
  defaultModel?: string;
  logger?: Logger;
  telemetry?: Telemetry;
  rateLimit?: RateLimitConfig;
  globalBudget?: BudgetConfig;
  debug?: boolean;
  debugSink?: DebugSink;
  suggestionEngine?: SuggestionEngine;
}
