import { useEffect, useMemo, useState } from "react";
import { DatasetWorker, runDataTask } from "./data-client";
import type { TaskInputs, TaskOutputs } from "./data-tasks";
import type { CSVData } from "./csv-parser";
import { tableRows, type SortConfig } from "./data-operations";

/** Callers memoize input; old results are hidden as soon as the input changes. */
export function useDataTask<K extends keyof TaskInputs>(
  kind: K,
  input: TaskInputs[K] | null,
) {
  const [state, setState] = useState<{
    input: typeof input;
    result?: TaskOutputs[K];
    error?: string;
  }>({ input: null });
  useEffect(() => {
    if (input === null) return;
    const controller = new AbortController();
    void runDataTask(kind, input, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ input, result });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            input,
            error:
              error instanceof Error ? error.message : "Unable to process data",
          });
      });
    return () => controller.abort();
  }, [kind, input]);
  const current = state.input === input;
  return {
    result: current ? state.result : undefined,
    error: current ? state.error : undefined,
    pending: input !== null && (!current || (!state.result && !state.error)),
  };
}

/** From this many rows, search and sort run in a long-lived worker. */
export const TABLE_WORKER_THRESHOLD = 10_000;

/**
 * Rows of the table preview. Small datasets are computed inline; large ones in
 * a worker that holds the dataset. While a query runs, the previous rows stay
 * on screen instead of an empty table.
 */
export function useTableRows(
  data: CSVData,
  query: string,
  sort: SortConfig | null,
) {
  const inWorker =
    data.rowCount >= TABLE_WORKER_THRESHOLD && typeof Worker !== "undefined";
  const [worker, setWorker] = useState<DatasetWorker | null>(null);
  const [view, setView] = useState<{
    data: CSVData;
    query: string;
    sort: SortConfig | null;
    rows: string[][];
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!inWorker) return;
    const next = new DatasetWorker(data);
    setWorker(next);
    return () => next.dispose();
  }, [data, inWorker]);

  const needsWorker = inWorker && (!!query.trim() || !!sort);
  useEffect(() => {
    if (!needsWorker || !worker) return;
    const controller = new AbortController();
    worker
      .tableIndices(query, sort, controller.signal)
      .then((indices) => {
        const rows = Array.from(indices, (i) => data.rows[i]!);
        setView({ data, query, sort, rows });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setView((previous) => ({
          data,
          query,
          sort,
          rows: previous?.data === data ? previous.rows : data.rows,
          error:
            error instanceof Error ? error.message : "Unable to process data",
        }));
      });
    return () => controller.abort();
  }, [needsWorker, worker, data, query, sort]);

  const inline = useMemo(
    () => (inWorker ? null : tableRows(data, query, sort)),
    [inWorker, data, query, sort],
  );
  if (inline) return { rows: inline, pending: false, error: undefined };
  if (!needsWorker)
    return { rows: data.rows, pending: false, error: undefined };
  const current =
    view?.data === data && view.query === query && view.sort === sort;
  return {
    // Keep the last rows of this dataset visible while the new ones compute
    rows: view?.data === data ? view.rows : data.rows,
    pending: !current,
    error: current ? view.error : undefined,
  };
}
