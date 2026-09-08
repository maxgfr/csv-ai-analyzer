import { useEffect, useState } from "react";
import { runDataTask } from "./data-client";
import type { TaskInputs, TaskOutputs } from "./data-tasks";

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
