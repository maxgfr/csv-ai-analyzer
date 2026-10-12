/**
 * Retry utility with exponential backoff for transient AI API errors.
 * This is the app's only retry layer (the AI SDK runs with maxRetries: 0).
 * The decision uses the provider's HTTP status and retry hint, kept on the
 * error or its cause; network and CORS failures are not retried.
 */
import { getErrorDetails, isAbortError } from "csv-charts-ai";

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  const { statusCode, isRetryable } = getErrorDetails(error);
  if (isRetryable !== undefined) return isRetryable;
  if (statusCode !== undefined) return RETRYABLE_STATUS.has(statusCode);
  // Errors without details: only whole-word transient statuses or rate limits
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    /\brate[ _-]?limit/.test(message) || /\b(429|502|503|504)\b/.test(message)
  );
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
      if (isAbortError(error)) throw error;

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
