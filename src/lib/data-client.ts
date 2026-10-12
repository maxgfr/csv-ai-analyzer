import type { TaskInputs, TaskOutputs } from "./data-tasks";
import type { CSVData } from "./csv-parser";
import type { SortConfig } from "./data-operations";

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
    // The result could not be deserialized: fail instead of waiting forever
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("Data worker sent an unreadable result. Try again."));
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

/**
 * A worker that receives a large dataset once, then answers table queries
 * (search + sort) with row indices. Stale answers are dropped by the caller.
 */
export class DatasetWorker {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (indices: Uint32Array) => void; reject: (e: unknown) => void }
  >();

  constructor(data: CSVData) {
    this.worker = new Worker(new URL("./data.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (
      event: MessageEvent<{
        id: number;
        indices?: Uint32Array;
        error?: string;
      }>,
    ) => {
      const request = this.pending.get(event.data.id);
      if (!request) return;
      this.pending.delete(event.data.id);
      if (event.data.indices) request.resolve(event.data.indices);
      else request.reject(new Error(event.data.error ?? "Unable to sort rows"));
    };
    const fail = (message: string) => () => this.rejectAll(new Error(message));
    this.worker.onerror = fail("Data worker failed. Reload and try again.");
    this.worker.onmessageerror = fail(
      "Data worker sent an unreadable result. Try again.",
    );
    this.worker.postMessage({ type: "dataset-load", data });
  }

  tableIndices(
    query: string,
    sort: SortConfig | null,
    signal?: AbortSignal,
  ): Promise<Uint32Array> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const abort = () => {
        this.pending.delete(id);
        reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
      };
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        resolve: (indices) => {
          signal?.removeEventListener("abort", abort);
          resolve(indices);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", abort);
          reject(error);
        },
      });
      this.worker.postMessage({ type: "table-query", id, query, sort });
    });
  }

  dispose() {
    this.worker.terminate();
    this.rejectAll(new DOMException("Worker disposed", "AbortError"));
  }

  private rejectAll(error: unknown) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}
