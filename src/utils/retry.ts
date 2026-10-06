import { logger } from "./logger.js";

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 1;
  const base = opts.baseDelayMs ?? 250;
  const max = opts.maxDelayMs ?? 2000;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const label = opts.label ?? "operation";

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err)) break;
      const delay =
        Math.min(max, base * 2 ** attempt) + Math.floor(Math.random() * 100);
      logger.warn(
        { err: (err as Error).message, attempt, delay, label },
        "retrying",
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
