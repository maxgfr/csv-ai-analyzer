/**
 * Bridge between the app's configuration system and the csv-charts-ai package.
 * All AI logic lives in the package — this file only handles:
 * - Registering AI providers (openai, anthropic, google, mistral)
 * - Converting app settings (AIServiceConfig) to a LanguageModel via createAppModel
 * - Re-exporting types for backwards compatibility
 */

import {
  createAppModel,
  registerProvider,
  fromSDK,
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
import { withRetry } from "./retry";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { type ModelId, type LanguageCode } from "./ai-models";

// ============ Register AI providers ============

registerProvider("openai", fromSDK(createOpenAI));
registerProvider("anthropic", (config) => {
  const anthropic = createAnthropic({
    apiKey: config.apiKey,
    headers: {
      ...config.headers,
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });
  return anthropic(config.model);
});
registerProvider("google", fromSDK(createGoogleGenerativeAI));
registerProvider("mistral", fromSDK(createMistral));

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
  language?: LanguageCode;
  customEndpoint?: string;
  customModel?: string;
}

// ============ Language mapping ============

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ja: "Japanese",
  zh: "Chinese",
};

// ============ Model Resolution ============

/**
 * Converts the app's AIServiceConfig to a LanguageModel
 * using the package's createAppModel.
 * Custom endpoints (Ollama, LM Studio, etc.) are called directly —
 * the user must enable CORS in the local server settings.
 */
export function getModel(config: AIServiceConfig) {
  return createAppModel({
    apiKey: config.apiKey,
    model: config.model,
    providerNpm: config.providerNpm,
    providerApi: config.providerApi,
    customEndpoint: config.customEndpoint,
    customModel: config.customModel,
  });
}

// ============ Thin wrappers (delegate to package) ============

export const generateChartSuggestions = async (
  config: AIServiceConfig,
  dataSummary: string,
  columns: string[],
): Promise<ChartConfig[]> => {
  const model = getModel(config);
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
        language: LANGUAGE_NAMES[config.language ?? "en"],
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
  const model = getModel(config);
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
        language: LANGUAGE_NAMES[config.language ?? "en"],
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
  const model = getModel(config);
  return withRetry(
    () =>
      repairChart({
        model,
        failedChart,
        columns,
        errorContext,
        signal: config.signal,
        language: LANGUAGE_NAMES[config.language ?? "en"],
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
  const model = getModel(config);
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
        language: LANGUAGE_NAMES[config.language ?? "en"],
      }),
    2,
    1000,
    config.signal,
  );
};

export const detectAnomalies = async (
  config: AIServiceConfig,
  dataSummary: string,
  data: TabularData,
): Promise<AnomalyResult[]> => {
  const model = getModel(config);
  return withRetry(
    () =>
      pkgDetectAnomalies({
        model,
        data,
        dataSummary,
        signal: config.signal,
        language: LANGUAGE_NAMES[config.language ?? "en"],
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
  const model = getModel(config);
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
    language: LANGUAGE_NAMES[config.language ?? "en"],
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
  const model = getModel(config);
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
        language: LANGUAGE_NAMES[config.language ?? "en"],
        count: 6,
      }),
    2,
    1000,
    config.signal,
  );
};
