/**
 * Bridge between the app's configuration system and the csv-charts-ai package.
 * All AI logic lives in the package — this file only handles:
 * - Converting app settings (AIServiceConfig) to a LanguageModel with llm-connect's
 *   loadModel, which imports the one SDK the settings need on first use
 * - Re-exporting types for backwards compatibility
 */

import {
  suggestCharts,
  suggestCustomChart,
  repairChart,
  summarizeData,
  detectAnomalies as pkgDetectAnomalies,
  streamAskAboutData,
  suggestQuestions as pkgSuggestQuestions,
} from "csv-charts-ai";
import type {
  ChartConfig,
  TabularData,
  DataSummaryResult,
  AnomalyResult,
  SuggestedQuestion,
} from "csv-charts-ai";
import { languageName, loadModel } from "llm-connect";
import { withRetry } from "./retry";
import { type ModelId } from "./ai-models";

// ============ Re-exports from package ============

export type { ChartConfig as ChartSuggestion } from "csv-charts-ai";
export type { ChartType, AggregationType } from "csv-charts-ai";
export type {
  DataSummaryResult,
  AnomalyResult,
  SuggestedQuestion,
} from "csv-charts-ai";
export { getAIErrorMessage } from "csv-charts-ai";

export interface CustomAnalysisResult {
  response: string;
}

// ============ App-specific config ============

export interface AIServiceConfig {
  apiKey: string;
  signal?: AbortSignal;
  model?: ModelId;
  providerId?: string;
  providerNpm?: string;
  providerApi?: string;
  /** Code of the response language, e.g. "fr". */
  language?: string;
  customEndpoint?: string;
  customModel?: string;
}

// ============ Model Resolution ============

/**
 * Converts the app's AIServiceConfig to a LanguageModel. Only the SDK the
 * settings need is imported, on first use: Anthropic gets the browser-access
 * header and keeps a compatible provider's own URL; the generic SDK needs the
 * catalog URL and turns json_schema output into json_object.
 * Custom endpoints (Ollama, LM Studio, etc.) are called directly —
 * the user must enable CORS in the local server settings.
 */
export function getModel(config: AIServiceConfig) {
  return loadModel({
    apiKey: config.apiKey,
    model: config.model ?? "",
    // A provider without an npm package uses the default (OpenAI) SDK
    providerNpm: config.providerNpm || undefined,
    providerApi: config.providerApi || undefined,
    customEndpoint: config.customEndpoint,
    customModel: config.customModel,
  });
}

// ============ Thin wrappers (delegate to package) ============

// withRetry is the only retry layer: the AI SDK must not retry on its own too
const SDK_RETRIES = { maxRetries: 0 } as const;

export const generateChartSuggestions = async (
  config: AIServiceConfig,
  dataSummary: string,
  columns: string[],
): Promise<ChartConfig[]> => {
  const model = await getModel(config);
  return withRetry(
    () =>
      suggestCharts({
        model,
        data: {
          headers: columns,
          rows: [],
          columns: columns.map((name, index) => ({
            name,
            type: "string" as const,
            index,
          })),
          rowCount: 0,
        },
        dataSummary,
        signal: config.signal,
        language: languageName(config.language),
        ...SDK_RETRIES,
      }),
    2,
    1000,
    config.signal,
  );
};

export const generateCustomChart = async (
  config: AIServiceConfig,
  dataSummary: string,
  userPrompt: string,
  columns: string[],
): Promise<ChartConfig | null> => {
  const model = await getModel(config);
  return withRetry(
    () =>
      suggestCustomChart({
        model,
        data: {
          headers: columns,
          rows: [],
          columns: columns.map((name, index) => ({
            name,
            type: "string" as const,
            index,
          })),
          rowCount: 0,
        },
        dataSummary,
        prompt: userPrompt,
        signal: config.signal,
        language: languageName(config.language),
        ...SDK_RETRIES,
      }),
    2,
    1000,
    config.signal,
  );
};

export const repairChartSuggestion = async (
  config: AIServiceConfig,
  failedChart: ChartConfig,
  columns: string[],
  errorContext: string,
): Promise<ChartConfig | null> => {
  const model = await getModel(config);
  return withRetry(
    () =>
      repairChart({
        model,
        failedChart,
        columns,
        errorContext,
        signal: config.signal,
        language: languageName(config.language),
        ...SDK_RETRIES,
      }),
    2,
    1000,
    config.signal,
  );
};

export const generateDataSummary = async (
  config: AIServiceConfig,
  dataSummary: string,
): Promise<DataSummaryResult> => {
  const model = await getModel(config);
  return withRetry(
    () =>
      summarizeData({
        model,
        data: {
          headers: ["_"],
          rows: [],
          columns: [{ name: "_", type: "string", index: 0 }],
          rowCount: 0,
        },
        dataSummary,
        signal: config.signal,
        language: languageName(config.language),
        ...SDK_RETRIES,
      }),
    2,
    1000,
    config.signal,
  );
};

/** Rows sent to the model for anomaly detection (the rest is only summarized). */
export const ANOMALY_SAMPLE_ROWS = 50;

export const detectAnomalies = async (
  config: AIServiceConfig,
  dataSummary: string,
  data: TabularData,
): Promise<AnomalyResult[]> => {
  const model = await getModel(config);
  return withRetry(
    () =>
      pkgDetectAnomalies({
        model,
        data,
        dataSummary,
        maxRows: ANOMALY_SAMPLE_ROWS,
        signal: config.signal,
        language: languageName(config.language),
        ...SDK_RETRIES,
      }),
    2,
    1000,
    config.signal,
  );
};

export const streamCustomAnalysis = async (
  config: AIServiceConfig,
  customPrompt: string,
  dataSummary: string,
  onChunk: (chunk: string) => void,
  onComplete: (fullText: string) => void,
  conversationHistory: Array<{ prompt: string; response: string }> = [],
): Promise<void> => {
  const model = await getModel(config);
  config.signal?.throwIfAborted();
  await streamAskAboutData({
    signal: config.signal,
    model,
    data: {
      headers: ["_"],
      rows: [],
      columns: [{ name: "_", type: "string", index: 0 }],
      rowCount: 0,
    },
    question: customPrompt,
    dataSummary,
    history: conversationHistory,
    language: languageName(config.language),
    ...SDK_RETRIES,
    onChunk: (chunk) => {
      if (!config.signal?.aborted) onChunk(chunk);
    },
    onComplete: (text) => {
      if (!config.signal?.aborted) onComplete(text);
    },
  });
  config.signal?.throwIfAborted();
};

export const fetchSuggestedQuestions = async (
  config: AIServiceConfig,
  dataSummary: string,
): Promise<SuggestedQuestion[]> => {
  const model = await getModel(config);
  return withRetry(
    () =>
      pkgSuggestQuestions({
        model,
        data: {
          headers: ["_"],
          rows: [],
          columns: [{ name: "_", type: "string", index: 0 }],
          rowCount: 0,
        },
        dataSummary,
        signal: config.signal,
        language: languageName(config.language),
        ...SDK_RETRIES,
        count: 6,
      }),
    2,
    1000,
    config.signal,
  );
};
