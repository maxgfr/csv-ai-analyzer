import { parseNumericValue } from "./values";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import type { ChartConfig, TabularData } from "./types";
import { requireProvider } from "./providers";

// ============ Input Validation Schemas ============

/** Zod schema for simple API config (OpenAI-compatible endpoints) */
export const AIConfigSchema = z.object({
  /** API key for authentication */
  apiKey: z.string(),
  /** Model identifier (e.g. "gpt-4o", "llama3", "mistral-large") */
  model: z.string(),
  /** Custom base URL for non-OpenAI providers (Ollama, vLLM, Mistral, etc.) */
  baseURL: z.string().optional(),
  /** Provider name — must match a registered provider. Defaults to "openai". */
  provider: z.string().optional().default("openai"),
});

export type AIConfig = z.infer<typeof AIConfigSchema>;

/** Zod schema for TabularData validation */
export const TabularDataSchema = z.object({
  headers: z.array(z.string()).min(1, "Data must have at least one column"),
  rows: z.array(z.array(z.string())),
  columns: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["string", "number", "date", "boolean"]),
      index: z.number(),
    }),
  ),
  rowCount: z.number(),
});

/**
 * Extended config for multi-provider apps.
 * Supports provider selection via npm package name (e.g. "@ai-sdk/anthropic").
 */
export interface AppModelConfig {
  apiKey: string;
  model?: string;
  /** Provider npm package name (e.g. "@ai-sdk/anthropic", "@ai-sdk/google") */
  providerNpm?: string;
  /** Provider base API URL (for OpenAI-compatible endpoints) */
  providerApi?: string;
  /** Custom endpoint URL (takes priority over providerNpm) */
  customEndpoint?: string;
  /** Custom model name (takes priority over model) */
  customModel?: string;
  /** Custom headers to pass to the provider (e.g. Anthropic browser access header) */
  headers?: Record<string, string>;
}

/** Model input: either a simple config object, an app config, or a pre-built LanguageModel */
export type ModelInput = AIConfig | AppModelConfig | LanguageModel;

// ============ Chart Output Schemas ============

const ChartSuggestionSchema = z.object({
  type: z.enum(["bar", "line", "pie", "scatter", "area"]),
  title: z.string(),
  description: z
    .string()
    .optional()
    .default("")
    .describe("Short description of what the chart shows"),
  xColumn: z
    .string()
    .describe("The EXACT column name to use for X axis (categories/labels)"),
  yColumn: z
    .string()
    .describe("The EXACT column name to use for Y axis (values)"),
  groupColumn: z
    .string()
    .optional()
    .describe("Optional column to group/segment the data"),
  aggregation: z
    .enum(["sum", "avg", "count", "min", "max", "none"])
    .optional()
    .default("none")
    .describe("How to aggregate Y values when there are duplicates in X"),
  reasoning: z
    .string()
    .optional()
    .default("")
    .describe("Brief explanation of why this chart is useful for this data"),
});

const ChartSuggestionsResponseSchema = z.object({
  charts: z.array(ChartSuggestionSchema),
});

const SingleChartResponseSchema = z.object({
  chart: ChartSuggestionSchema,
});

// ============ Error Handling ============

/**
 * Extracts a user-friendly error message from AI provider errors.
 * Exported so consumers can use it in their own error handling.
 */
export function getAIErrorMessage(error: unknown): string {
  // Handle Zod validation errors
  if (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error
  ) {
    const issues = (error as { issues: Array<{ message: string }> }).issues;
    return `Invalid data: ${issues.map((i) => i.message).join(", ")}`;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("rate limit") || message.includes("429")) {
      return "Rate limit exceeded. Please wait a moment and try again.";
    }
    if (
      message.includes("unauthorized") ||
      message.includes("401") ||
      message.includes("invalid api key") ||
      message.includes("invalid_api_key")
    ) {
      return "Invalid API key. Please check your API key configuration.";
    }
    if (
      message.includes("quota") ||
      message.includes("insufficient_quota") ||
      message.includes("billing")
    ) {
      return "API quota exceeded or billing issue. Please check your account status.";
    }
    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("fetch failed")
    ) {
      return "Network error. Please check your internet connection and try again.";
    }
    if (
      message.includes("model") &&
      (message.includes("not found") || message.includes("does not exist"))
    ) {
      return "Model not available. Please select a different model.";
    }

    return error.message;
  }

  return "An unexpected error occurred. Please try again.";
}

// ============ Data Summary Generation ============

/**
 * Generate a text summary of tabular data for AI consumption.
 * If the consumer doesn't provide a `dataSummary`, this is used automatically.
 */
export function summarizeTabularData(data: TabularData): string {
  const lines: string[] = [];
  lines.push(`Dataset: ${data.rowCount} rows, ${data.headers.length} columns`);
  lines.push(`Columns: ${data.headers.join(", ")}`);
  lines.push("");

  for (const col of data.columns) {
    const idx = col.index;
    const values = data.rows.map((r) => r[idx] ?? "").filter((v) => v !== "");

    if (col.type === "number") {
      const nums = values
        .map(parseNumericValue)
        .filter((n): n is number => n !== null);
      if (nums.length > 0) {
        const min = nums.reduce((a, b) => (b < a ? b : a), nums[0]!);
        const max = nums.reduce((a, b) => (b > a ? b : a), nums[0]!);
        const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
        lines.push(
          `- ${col.name} (${col.type}): min=${min}, max=${max}, avg=${avg.toFixed(2)}, ${nums.length} values`,
        );
      } else {
        lines.push(`- ${col.name} (${col.type}): no valid numeric values`);
      }
    } else {
      const distinct = new Set(values).size;
      const sample = values.slice(0, 5).join(", ");
      lines.push(
        `- ${col.name} (${col.type}): ${distinct} distinct values, sample: [${sample}]`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Generate a detailed human-readable summary of tabular data,
 * including column statistics and sample rows.
 *
 * @example
 * ```ts
 * const summary = generateDataSummary(data);
 * // "Dataset with 150 rows and 4 columns.\n\nColumns:\n- name (text): 120 unique values..."
 * ```
 */
export function generateDataSummary(data: TabularData): string {
  const summary: string[] = [];

  summary.push(
    `Dataset with ${data.rowCount} rows and ${data.columns.length} columns.`,
  );
  summary.push("\nColumns:");

  data.columns.forEach((col) => {
    if (col.type === "number") {
      let count = 0,
        min = Infinity,
        max = -Infinity,
        sum = 0;
      for (const row of data.rows) {
        const value = parseNumericValue(row[col.index] ?? "");
        if (value === null) continue;
        count++;
        sum += value;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      if (count > 0) {
        const avg = sum / count;
        summary.push(
          `- ${col.name} (number): min=${min.toFixed(2)}, max=${max.toFixed(2)}, avg=${avg.toFixed(2)}, ${count} values`,
        );
      } else {
        summary.push(`- ${col.name} (number): no valid values`);
      }
    } else if (col.type === "string") {
      const uniqueValues = new Set<string>();
      for (const row of data.rows) {
        const value = row[col.index] ?? "";
        if (value.trim()) uniqueValues.add(value);
      }
      const uniqueCount = uniqueValues.size;
      const sampleValues = Array.from(uniqueValues).slice(0, 5).join(", ");
      summary.push(
        `- ${col.name} (text): ${uniqueCount} unique values, examples: ${sampleValues}`,
      );
    } else if (col.type === "date") {
      summary.push(
        `- ${col.name} (date): ${data.rows.reduce((n, row) => n + ((row[col.index] ?? "").trim() ? 1 : 0), 0)} values`,
      );
    } else if (col.type === "boolean") {
      summary.push(
        `- ${col.name} (boolean): ${data.rows.reduce((n, row) => n + ((row[col.index] ?? "").trim() ? 1 : 0), 0)} values`,
      );
    }
  });

  // Add sample rows
  summary.push("\nFirst 5 rows sample:");
  const sampleRows = data.rows.slice(0, 5);
  sampleRows.forEach((row, i) => {
    const rowData = data.columns
      .map((col) => `${col.name}: ${row[col.index] ?? "N/A"}`)
      .join(", ");
    summary.push(`Row ${i + 1}: ${rowData}`);
  });

  return summary.join("\n");
}

// ============ Model Resolution ============

function isLanguageModel(input: unknown): input is LanguageModel {
  return (
    typeof input === "object" &&
    input !== null &&
    "doGenerate" in input &&
    typeof (input as Record<string, unknown>).doGenerate === "function"
  );
}

/**
 * Create a LanguageModel from an AIConfig.
 * The provider must be registered beforehand via {@link registerProvider}.
 *
 * @example
 * ```ts
 * import { registerProvider, fromSDK, createModel } from "csv-charts-ai";
 * import { createOpenAI } from "@ai-sdk/openai";
 *
 * registerProvider("openai", fromSDK(createOpenAI));
 *
 * const model = createModel({ apiKey: "sk-...", model: "gpt-4o" });
 * ```
 */
export function createModel(config: AIConfig): LanguageModel {
  const parsed = AIConfigSchema.parse(config);
  const factory = requireProvider(parsed.provider);
  return factory({
    apiKey: parsed.apiKey,
    model: parsed.model,
    ...(parsed.baseURL && { baseURL: parsed.baseURL }),
  });
}

/**
 * Create a LanguageModel from an AppModelConfig.
 * Handles multi-provider apps with providerNpm-based routing and
 * custom endpoints.
 *
 * The provider identified by `providerNpm` (or `"openai"` by default)
 * must be registered beforehand via {@link registerProvider}.
 *
 * @example
 * ```ts
 * const model = createAppModel({
 *   apiKey: "sk-...",
 *   model: "claude-haiku-4-5",
 *   providerNpm: "@ai-sdk/anthropic",
 * });
 * ```
 */
export function createAppModel(config: AppModelConfig): LanguageModel {
  const modelName = config.customModel ?? config.model ?? "";

  if (config.customEndpoint) {
    const factory = requireProvider("openai");
    return factory({
      apiKey: config.apiKey || "",
      model: config.customModel ?? modelName,
      baseURL: config.customEndpoint,
      ...(config.headers && { headers: config.headers }),
    });
  }

  const providerName = config.providerNpm ?? "openai";
  const factory = requireProvider(providerName);
  return factory({
    apiKey: config.apiKey,
    model: modelName,
    ...(config.providerApi && { baseURL: config.providerApi }),
    ...(config.headers && { headers: config.headers }),
  });
}

function isAppModelConfig(input: unknown): input is AppModelConfig {
  if (typeof input !== "object" || input === null) return false;
  if ("doGenerate" in input) return false; // LanguageModel
  // AppModelConfig is identified by its unique fields (providerNpm, providerApi, customEndpoint, customModel)
  // This avoids misrouting AIConfig objects (which have provider/baseURL) through createAppModel
  return (
    "providerNpm" in input ||
    "providerApi" in input ||
    "customEndpoint" in input ||
    "customModel" in input
  );
}

export function resolveModel(input: ModelInput): LanguageModel {
  if (isLanguageModel(input)) return input;
  if (isAppModelConfig(input)) return createAppModel(input);
  return createModel(input as AIConfig);
}

// ============ Prompts ============

const getChartSystemPrompt = (
  columns: string[],
  language?: string,
) => `You are a data visualization expert.${language ? ` Respond in ${language}.` : ""}

You will analyze CSV data and suggest the best charts to visualize it.

AVAILABLE COLUMNS (use these EXACT names):
${columns.map((c) => `- "${c}"`).join("\n")}

CRITICAL RULES:
1. xColumn and yColumn MUST be exact column names from the list above
2. For numeric analysis, yColumn should be a numeric column
3. For categorical comparisons, xColumn should be a categorical column
4. Only suggest charts that make sense for the data types
5. Use aggregation when there are multiple rows per category:
   - "sum" for totals (sales, revenue)
   - "avg" for averages (ratings, scores)
   - "count" for frequencies
   - "none" for unique values or time series
6. Suggest 2-4 charts maximum, focusing on the most insightful ones

CHART TYPE GUIDELINES:
- bar: Compare categories (xColumn=category, yColumn=numeric)
- line: Show trends over time (xColumn=date/time, yColumn=numeric)
- pie: Show proportions (xColumn=category, yColumn=numeric with sum/count)
- scatter: Show correlations (xColumn=numeric, yColumn=numeric, aggregation=none)
- area: Show cumulative trends (xColumn=date/time, yColumn=numeric)`;

const getCustomChartPrompt = (
  columns: string[],
  language?: string,
) => `You are a data visualization expert.${language ? ` Respond in ${language}.` : ""}

Create a chart configuration based on the user's request.

AVAILABLE COLUMNS (use these EXACT names):
${columns.map((c) => `- "${c}"`).join("\n")}

IMPORTANT: Column names MUST exactly match the list above.`;

// ============ Helpers ============

function mapChartResult(
  raw: z.infer<typeof ChartSuggestionSchema>,
  id: string,
): ChartConfig {
  return {
    id,
    type: raw.type,
    title: raw.title,
    description: raw.description,
    xAxis: raw.xColumn,
    yAxis: raw.yColumn,
    groupBy: raw.groupColumn,
    aggregation: raw.aggregation,
    dataConfig: {
      xColumn: raw.xColumn,
      yColumn: raw.yColumn,
      groupColumn: raw.groupColumn,
    },
  };
}

// ============ Options ============

export interface SuggestChartsOptions {
  /** The AI model — either a simple config or a LanguageModel instance */
  model: ModelInput;
  /** The tabular data to analyze */
  data: TabularData;
  /** A text summary of the data. If omitted, auto-generated from `data`. */
  dataSummary?: string;
  /** Language for AI responses (e.g. "English", "French") */
  language?: string;
  /** Temperature for AI generation (default: 0.5) */
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
}

export interface SuggestCustomChartOptions {
  /** The AI model — either a simple config or a LanguageModel instance */
  model: ModelInput;
  /** The tabular data */
  data: TabularData;
  /** A text summary of the data. If omitted, auto-generated from `data`. */
  dataSummary?: string;
  /** The user's chart request (e.g. "show sales by month") */
  prompt: string;
  /** Language for AI responses */
  language?: string;
  /** Temperature (default: 0.5) */
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
}

export interface RepairChartOptions {
  /** The AI model — either a simple config or a LanguageModel instance */
  model: ModelInput;
  /** The chart configuration that failed */
  failedChart: ChartConfig;
  /** Available column names */
  columns: string[];
  /** Description of why the chart failed */
  errorContext: string;
  /** Language for AI responses */
  language?: string;
  /** Temperature (default: 0.3) */
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
}

// ============ Public API ============

/**
 * Generate chart suggestions from tabular data using AI.
 *
 * @example
 * ```ts
 * import { suggestCharts } from "csv-charts-ai";
 *
 * // Minimal — auto-generates dataSummary from the data
 * const charts = await suggestCharts({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 * });
 *
 * // Custom endpoint — Ollama
 * const charts = await suggestCharts({
 *   model: { apiKey: "", model: "llama3", baseURL: "http://localhost:11434/v1" },
 *   data: myData,
 * });
 *
 * // Advanced — any LanguageModel from the ai SDK
 * import { anthropic } from "@ai-sdk/anthropic";
 * const charts = await suggestCharts({
 *   model: anthropic("claude-sonnet-4-20250514"),
 *   data: myData,
 *   language: "French",
 * });
 * ```
 */
export async function suggestCharts(
  options: SuggestChartsOptions,
): Promise<ChartConfig[]> {
  const { data, language, temperature = 0.5, signal } = options;
  const dataSummary = options.dataSummary ?? summarizeTabularData(data);

  try {
    TabularDataSchema.parse(data);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: ChartSuggestionsResponseSchema,
      system: getChartSystemPrompt(data.headers, language),
      prompt: `Analyze this CSV data and suggest the best charts:\n\n${dataSummary}`,
      temperature,
      ...(signal && { abortSignal: signal }),
    });

    return object.charts.map((s, i) =>
      mapChartResult(s, `chart-${i}-${Date.now()}`),
    );
  } catch (error) {
    throw new Error(getAIErrorMessage(error));
  }
}

/**
 * Generate a single chart from a user's text prompt.
 *
 * @example
 * ```ts
 * const chart = await suggestCustomChart({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 *   prompt: "Show me a bar chart of sales by category",
 * });
 * ```
 */
export async function suggestCustomChart(
  options: SuggestCustomChartOptions,
): Promise<ChartConfig | null> {
  const { data, prompt, language, temperature = 0.5, signal } = options;
  const dataSummary = options.dataSummary ?? summarizeTabularData(data);

  try {
    TabularDataSchema.parse(data);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: SingleChartResponseSchema,
      system: getCustomChartPrompt(data.headers, language),
      prompt: `Data summary:\n${dataSummary}\n\nUser request: ${prompt}`,
      temperature,
      ...(signal && { abortSignal: signal }),
    });

    return mapChartResult(object.chart, `chart-custom-${Date.now()}`);
  } catch (error) {
    throw new Error(getAIErrorMessage(error));
  }
}

/**
 * Repair a chart configuration that failed to render.
 *
 * @example
 * ```ts
 * const fixed = await repairChart({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   failedChart: brokenChart,
 *   columns: ["name", "sales", "date"],
 *   errorContext: "Column 'revenue' does not exist",
 * });
 * ```
 */
export async function repairChart(
  options: RepairChartOptions,
): Promise<ChartConfig | null> {
  const {
    failedChart,
    columns,
    errorContext,
    language,
    temperature = 0.3,
    signal,
  } = options;

  try {
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: SingleChartResponseSchema,
      system: getCustomChartPrompt(columns, language),
      prompt: `The following chart configuration failed to render:\n${JSON.stringify(failedChart, null, 2)}\n\nError context: ${errorContext}\n\nPlease fix the configuration to use valid columns and aggregation. Available columns: ${columns.join(", ")}`,
      temperature,
      ...(signal && { abortSignal: signal }),
    });

    return mapChartResult(object.chart, failedChart.id);
  } catch (error) {
    throw new Error(getAIErrorMessage(error));
  }
}
