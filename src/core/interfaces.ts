import type {
  CompletionRequest,
  CompletionResponse,
  ProviderConfig,
  StreamingResponse,
} from "./types.js";

export interface ProviderAdapter {
  readonly name: string;
  readonly config: ProviderConfig;
  supportsModel(model: string): boolean;
  completion(req: CompletionRequest): Promise<CompletionResponse>;
  stream(req: CompletionRequest): StreamingResponse;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export type MiddlewareNext = () => Promise<CompletionResponse>;

export type Middleware = (
  req: CompletionRequest,
  next: MiddlewareNext,
) => Promise<CompletionResponse>;
