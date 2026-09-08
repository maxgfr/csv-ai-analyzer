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
