import type { TaskInputs, TaskOutputs } from "./data-tasks";

/** Each task owns a worker: aborting also releases its input and intermediate arrays. */
export async function runDataTask<K extends keyof TaskInputs>(
  kind: K,
  input: TaskInputs[K],
  signal?: AbortSignal,
): Promise<TaskOutputs[K]> {
  signal?.throwIfAborted();
  if (typeof Worker === "undefined") {
    const { executeDataTask } = await import("./data-tasks");
    const result = await executeDataTask(kind, input);
    signal?.throwIfAborted();
    return result;
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./data.worker.ts", import.meta.url), {
      type: "module",
    });
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    worker.onmessage = (
      event: MessageEvent<{ result: TaskOutputs[K]; error?: string }>,
    ) => {
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = (event) => {
      cleanup();
      reject(
        new Error(event.message || "Data worker failed. Reload and try again."),
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage({ kind, input });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
