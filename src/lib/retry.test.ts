import { it, expect, vi, afterEach } from "vitest";
import { withRetry } from "./retry";
import { RequestScope } from "./request-scope";
afterEach(() => vi.useRealTimers());
it("retries transient failures and returns the successful result", async () => {
  const fn = vi
    .fn()
    .mockRejectedValueOnce(new Error("503"))
    .mockResolvedValue("ok");
  expect(await withRetry(fn, 2, 1)).toBe("ok");
  expect(fn).toHaveBeenCalledTimes(2);
});
it("does not retry authentication errors", async () => {
  const fn = vi.fn().mockRejectedValue(new Error("401 unauthorized"));
  await expect(withRetry(fn)).rejects.toThrow("401");
  expect(fn).toHaveBeenCalledTimes(1);
});
it("aborts a backoff immediately without starting another request", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const fn = vi.fn().mockRejectedValue(new Error("503"));
  const promise = withRetry(fn, 2, 1000, controller.signal);
  const verdict = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await verdict;
  await vi.runAllTimersAsync();
  expect(fn).toHaveBeenCalledTimes(1);
});
it("discards a result even if the provider ignores cancellation", async () => {
  const scope = new RequestScope();
  const signal = scope.start("summary");
  let resolve!: (value: string) => void;
  const request = withRetry(
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
    0,
    0,
    signal,
  );
  const verdict = expect(request).rejects.toMatchObject({ name: "AbortError" });
  scope.cancelAll();
  resolve("stale");
  await verdict;
});
it("replaces only the requested action", () => {
  const scope = new RequestScope();
  const first = scope.start("chat"),
    summary = scope.start("summary");
  scope.start("chat");
  expect(first.aborted).toBe(true);
  expect(summary.aborted).toBe(false);
  scope.cancelAll();
  expect(summary.aborted).toBe(true);
});
it("does not retry network or CORS failures", async () => {
  for (const message of ["Failed to fetch", "network error", "timeout"]) {
    const fn = vi.fn().mockRejectedValue(new TypeError(message));
    await expect(withRetry(fn, 2, 1)).rejects.toThrow(message);
    expect(fn).toHaveBeenCalledTimes(1);
  }
});
it("classifies on the status code kept in the cause", async () => {
  const retryable = new Error("Rate limit exceeded", {
    cause: { statusCode: 429 },
  });
  const fn = vi.fn().mockRejectedValueOnce(retryable).mockResolvedValue("ok");
  expect(await withRetry(fn, 2, 1)).toBe("ok");
  expect(fn).toHaveBeenCalledTimes(2);

  const final = Object.assign(new Error("Server error 503"), {
    statusCode: 503,
    isRetryable: false,
  });
  const once = vi.fn().mockRejectedValue(final);
  await expect(withRetry(once, 2, 1)).rejects.toBe(final);
  expect(once).toHaveBeenCalledTimes(1);
});
it("does not read status codes inside identifiers", async () => {
  const fn = vi.fn().mockRejectedValue(new Error("request id_5030 failed"));
  await expect(withRetry(fn, 2, 1)).rejects.toThrow("id_5030");
  expect(fn).toHaveBeenCalledTimes(1);
});
it("cancels one action without touching the others", () => {
  const scope = new RequestScope();
  const chat = scope.start("chat"),
    summary = scope.start("summary");
  scope.cancel("chat");
  expect(chat.aborted).toBe(true);
  expect(summary.aborted).toBe(false);
  expect(scope.isLatest("chat", chat)).toBe(true);
});
it("tells a replaced request from a cancelled one", () => {
  const scope = new RequestScope();
  const first = scope.start("summary");
  const second = scope.start("summary");
  expect(scope.isLatest("summary", first)).toBe(false);
  expect(scope.isLatest("summary", second)).toBe(true);
  scope.cancelAll();
  expect(scope.isLatest("summary", second)).toBe(true);
});
