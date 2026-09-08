/**
 * Retry utility with exponential backoff for transient AI API errors.
 * Only retries on rate-limit (429), network, and server errors (502/503).
 */

const RETRYABLE_PATTERNS = [
  "rate limit",
  "429",
  "network",
  "timeout",
  "econnrefused",
  "econnreset",
  "503",
  "502",
  "fetch failed",
];

function isRetryableError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 1000,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    signal?.throwIfAborted();
    try {
      const result = await fn();
      signal?.throwIfAborted();
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error;
      if (error instanceof Error && error.name === "AbortError") throw error;

      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * 2 ** attempt;
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", abort);
          resolve();
        }, delay);
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      });
    }
  }

  throw lastError;
}
