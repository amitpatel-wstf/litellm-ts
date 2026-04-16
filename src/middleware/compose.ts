import type { CompletionRequest, CompletionResponse } from "../core/types.js";
import type { Middleware } from "../core/interfaces.js";

export function composeMiddleware(
  middleware: Middleware[],
  terminal: (req: CompletionRequest) => Promise<CompletionResponse>,
): (req: CompletionRequest) => Promise<CompletionResponse> {
  return async (req: CompletionRequest): Promise<CompletionResponse> => {
    let index = -1;
    async function dispatch(i: number): Promise<CompletionResponse> {
      if (i <= index) throw new Error("next called multiple times");
      index = i;
      const fn = middleware[i];
      if (!fn) return terminal(req);
      return fn(req, () => dispatch(i + 1));
    }
    return dispatch(0);
  };
}
