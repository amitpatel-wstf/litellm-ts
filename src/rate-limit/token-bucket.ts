import { RateLimitError } from "../core/errors.js";

interface Bucket {
  windowStartMs: number;
  count: number;
}

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  consume(key: string, limitPerMinute: number): void {
    if (limitPerMinute <= 0) return;
    const now = Date.now();
    const minuteMs = 60_000;
    const windowStartMs = now - (now % minuteMs);
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.windowStartMs !== windowStartMs) {
      this.buckets.set(key, { windowStartMs, count: 1 });
      return;
    }

    if (bucket.count >= limitPerMinute) {
      throw new RateLimitError(`Rate limit exceeded for ${key}`);
    }

    bucket.count += 1;
  }
}
