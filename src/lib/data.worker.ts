import { executeDataTask, type TaskInputs } from "./data-tasks";
import { tableRowIndices, type SortConfig } from "./data-operations";
import type { CSVData } from "./csv-parser";

/** Messages of the long-lived table worker (see DatasetWorker). */
export type DatasetMessage =
  | { type: "dataset-load"; data: CSVData }
  | {
      type: "table-query";
      id: number;
      query: string;
      sort: SortConfig | null;
    };

// Dataset kept between table queries, so large files are cloned to the worker only once
let dataset: CSVData | null = null;

self.onmessage = async (
  event: MessageEvent<
    | DatasetMessage
    | { kind: keyof TaskInputs; input: TaskInputs[keyof TaskInputs] }
  >,
) => {
  const message = event.data;
  if ("type" in message) {
    if (message.type === "dataset-load") {
      dataset = message.data;
      return;
    }
    try {
      if (!dataset) throw new Error("No dataset loaded in the table worker");
      const indices = Uint32Array.from(
        tableRowIndices(dataset, message.query, message.sort),
      );
      self.postMessage(
        { id: message.id, indices },
        { transfer: [indices.buffer] },
      );
    } catch (error) {
      self.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : "Unable to sort rows",
      });
    }
    return;
  }
  try {
    self.postMessage({
      result: await executeDataTask(message.kind, message.input),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Unable to process data",
    });
  }
};
