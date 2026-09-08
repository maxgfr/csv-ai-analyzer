import { executeDataTask, type TaskInputs } from "./data-tasks";
self.onmessage = async (
  event: MessageEvent<{
    kind: keyof TaskInputs;
    input: TaskInputs[keyof TaskInputs];
  }>,
) => {
  try {
    self.postMessage({
      result: await executeDataTask(event.data.kind, event.data.input),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Unable to process data",
    });
  }
};
