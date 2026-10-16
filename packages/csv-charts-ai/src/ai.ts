import {
  detectDateOrder,
  parseDateValue,
  parseNumericValue,
  roundSignificant,
} from "./values";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import type { ChartConfig, TabularData } from "./types";
import {
  createModel as createSettingsModel,
  type LlmSettings,
} from "llm-connect";
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
  /** Extra HTTP headers sent with every request */
  headers: z.record(z.string(), z.string()).optional(),
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
 * Extended config for multi-provider apps: llm-connect's `LlmSettings`, with
 * `model` optional (a custom endpoint names its model in `customModel`).
 * Supports provider selection via npm package name (e.g. "@ai-sdk/anthropic").
 */
export type AppModelConfig = Omit<LlmSettings, "model"> & {
  /** Model id of the catalog provider */
  model?: string;
};

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
 * Error thrown by the AI functions. `message` is user-facing; the provider error
 * stays in `cause`, and its HTTP status and retry hint are copied when known.
 */
export class AIRequestError extends Error {
  readonly statusCode?: number;
  readonly isRetryable?: boolean;

  constructor(
    message: string,
    options: { cause: unknown; statusCode?: number; isRetryable?: boolean },
  ) {
    super(message, { cause: options.cause });
    this.name = "AIRequestError";
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable;
  }
}

/** True for cancellations (AbortController, AbortSignal.timeout). */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/**
 * Find the HTTP status and retry hint of a provider error, looking through
 * `cause` and the AI SDK's RetryError (`lastError`).
 */
export function getErrorDetails(error: unknown): {
  statusCode?: number;
  isRetryable?: boolean;
} {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current !== "object") break;
    const record = current as Record<string, unknown>;
    if (typeof record.statusCode === "number")
      return {
        statusCode: record.statusCode,
        ...(typeof record.isRetryable === "boolean" && {
          isRetryable: record.isRetryable,
        }),
      };
    current = record.lastError ?? record.cause;
  }
  return {};
}

/** Rethrow cancellations untouched; wrap everything else in an {@link AIRequestError}. */
export function toAIError(error: unknown): Error {
  if (isAbortError(error)) return error as Error;
  if (error instanceof AIRequestError) return error;
  return new AIRequestError(getAIErrorMessage(error), {
    cause: error,
    ...getErrorDetails(error),
  });
}

const RATE_LIMIT_MESSAGE =
  "Rate limit exceeded. Please wait a moment and try again.";
const AUTH_MESSAGE =
  "Invalid API key. Please check your API key configuration.";
const QUOTA_MESSAGE =
  "API quota exceeded or billing issue. Please check your account status.";
const MODEL_MESSAGE = "Model not available. Please select a different model.";

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
    const isQuota = /\b(insufficient_quota|quota|billing)\b/.test(message);
    const isModel =
      message.includes("model") &&
      (message.includes("not found") || message.includes("does not exist"));

    // Prefer the HTTP status reported by the provider over the message text
    const { statusCode } = getErrorDetails(error);
    if (statusCode === 429) return isQuota ? QUOTA_MESSAGE : RATE_LIMIT_MESSAGE;
    if (statusCode === 401) return AUTH_MESSAGE;
    if (statusCode === 402) return QUOTA_MESSAGE;
    if (statusCode === 404 && isModel) return MODEL_MESSAGE;

    // Fallback on the text, matching status codes as whole words only (id_4290 is not a 429)
    if (/\brate[ _-]?limit/.test(message) || /\b429\b/.test(message)) {
      return RATE_LIMIT_MESSAGE;
    }
    if (
      /\bunauthorized\b/.test(message) ||
      /\b401\b/.test(message) ||
      message.includes("invalid api key") ||
      message.includes("invalid_api_key")
    ) {
      return AUTH_MESSAGE;
    }
    if (isQuota) return QUOTA_MESSAGE;
    if (
      /\bnetwork\b/.test(message) ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("econnrefused") ||
      message.includes("fetch failed") ||
      message.includes("failed to fetch") ||
      message.includes("load failed")
    ) {
      return "Network error: the AI provider could not be reached. Check your connection and API URL. If the provider blocks browser requests (CORS), use a server relay you control or a provider that supports browser access. This error does not verify your API key.";
    }
    if (isModel) return MODEL_MESSAGE;

    return error.message;
  }

  return "An unexpected error occurred. Please try again.";
}

// ============ Prompt size limits ============

/** Longest cell value sent to the model; longer values are cut. */
export const MAX_PROMPT_CELL_LENGTH = 200;

/** Cut a cell value so one huge cell cannot blow up a prompt. */
export function clipCell(value: string, max = MAX_PROMPT_CELL_LENGTH): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Check the shape of tabular data before building prompts. Only the headers,
 * columns and a sample of rows are validated, so large files stay cheap.
 */
export function validateTabularData(data: TabularData): void {
  TabularDataSchema.parse({ ...data, rows: data.rows.slice(0, 50) });
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
      const sample = values
        .slice(0, 5)
        .map((v) => clipCell(v))
        .join(", ");
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
          `- ${col.name} (number): min=${roundSignificant(min)}, max=${roundSignificant(max)}, avg=${roundSignificant(avg)}, sum=${roundSignificant(sum)}, ${count} values`,
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
      const sampleValues = Array.from(uniqueValues)
        .slice(0, 5)
        .map((v) => clipCell(v))
        .join(", ");
      summary.push(
        `- ${col.name} (text): ${uniqueCount} unique values, examples: ${sampleValues}`,
      );
    } else if (col.type === "date") {
      const range = dateRange(data, col.index);
      summary.push(
        `- ${col.name} (date): ${range.count} values${range.count ? `, from ${range.first} to ${range.last}` : ""}`,
      );
    } else if (col.type === "boolean") {
      summary.push(
        `- ${col.name} (boolean): ${data.rows.reduce((n, row) => n + ((row[col.index] ?? "").trim() ? 1 : 0), 0)} values`,
      );
    }
  });

  // Totals per category and per period, computed here on every row: the model
  // only sees a few sample rows, so it cannot add them up itself
  const groups = summarizeGroups(data);
  if (groups.length) {
    summary.push(
      `\nGroup totals (exact, computed on all ${data.rowCount} rows):`,
      ...groups,
    );
  }

  // Add sample rows
  summary.push("\nFirst 5 rows sample:");
  const sampleRows = data.rows.slice(0, 5);
  sampleRows.forEach((row, i) => {
    const rowData = data.columns
      .map((col) => `${col.name}: ${clipCell(row[col.index] ?? "N/A")}`)
      .join(", ");
    summary.push(`Row ${i + 1}: ${rowData}`);
  });

  return summary.join("\n");
}

// ============ Group totals ============

/** Categorical columns with at most this many distinct values get group totals. */
const MAX_GROUPS = 50;
/** Groups listed per breakdown (largest first); the rest are counted. */
const SHOWN_GROUPS = 10;

function dateRange(data: TabularData, index: number) {
  const values = data.rows.map((row) => row[index] ?? "");
  const order = detectDateOrder(values);
  let first: { time: number; text: string } | null = null;
  let last: { time: number; text: string } | null = null;
  let count = 0;
  for (const text of values) {
    const time = parseDateValue(text, order);
    if (time === null) continue;
    count++;
    if (!first || time < first.time) first = { time, text: text.trim() };
    if (!last || time > last.time) last = { time, text: text.trim() };
  }
  return { count, first: first?.text, last: last?.text };
}

function formatTotals(
  title: string,
  totals: Map<string, { sum: number; count: number }>,
  byKey = false,
): string {
  const entries = [...totals.entries()].sort((a, b) =>
    byKey ? a[0].localeCompare(b[0]) : b[1].sum - a[1].sum,
  );
  const shown = byKey ? entries : entries.slice(0, SHOWN_GROUPS);
  const rest = entries.length - shown.length;
  return `- ${title}: ${shown
    .map(
      ([key, t]) =>
        `${clipCell(key, 60)}=${roundSignificant(t.sum)} (${t.count} rows)`,
    )
    .join("; ")}${rest > 0 ? `; … ${rest} more groups` : ""}`;
}

/**
 * Sums of up to 3 numeric columns per value of up to 4 low-cardinality text
 * columns, and per month (or year) of the first date column.
 */
function summarizeGroups(data: TabularData): string[] {
  const numeric = data.columns.filter((c) => c.type === "number").slice(0, 3);
  const lines: string[] = [];
  const categorical = data.columns
    .filter((c) => c.type === "string" || c.type === "boolean")
    .filter((c) => {
      const distinct = new Set<string>();
      for (const row of data.rows) {
        distinct.add((row[c.index] ?? "").trim());
        if (distinct.size > MAX_GROUPS) return false;
      }
      return distinct.size >= 2 && distinct.size < data.rows.length;
    })
    .slice(0, 4);

  const accumulate = (key: (row: string[]) => string | null) =>
    (numeric.length ? numeric : [null]).map((num) => {
      const totals = new Map<string, { sum: number; count: number }>();
      for (const row of data.rows) {
        const k = key(row);
        if (k === null) continue;
        const value = num ? parseNumericValue(row[num.index] ?? "") : 1;
        if (value === null) continue;
        const t = totals.get(k) ?? { sum: 0, count: 0 };
        t.sum += value;
        t.count++;
        totals.set(k, t);
      }
      return { num, totals };
    });

  for (const cat of categorical) {
    for (const { num, totals } of accumulate(
      (row) => (row[cat.index] ?? "").trim() || "(empty)",
    ))
      lines.push(
        formatTotals(
          num ? `${num.name} by ${cat.name}` : `Rows by ${cat.name}`,
          totals,
        ),
      );
  }

  const dateCol = data.columns.find((c) => c.type === "date");
  if (dateCol) {
    const order = detectDateOrder(data.rows.map((r) => r[dateCol.index] ?? ""));
    const times = data.rows
      .map((r) => parseDateValue(r[dateCol.index] ?? "", order))
      .filter((t): t is number => t !== null);
    if (times.length) {
      let min = Infinity,
        max = -Infinity;
      for (const t of times) {
        if (t < min) min = t;
        if (t > max) max = t;
      }
      const span = (max - min) / (1000 * 60 * 60 * 24 * 31);
      const monthly = span <= 36;
      const period = (row: string[]) => {
        const t = parseDateValue(row[dateCol.index] ?? "", order);
        if (t === null) return null;
        const iso = new Date(t).toISOString();
        return monthly ? iso.slice(0, 7) : iso.slice(0, 4);
      };
      for (const { num, totals } of accumulate(period))
        lines.push(
          formatTotals(
            `${num ? num.name : "Rows"} by ${monthly ? "month" : "year"} of ${dateCol.name}`,
            totals,
            true,
          ),
        );
    }
  }
  return lines;
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
    ...(parsed.headers && { headers: parsed.headers }),
  });
}

/**
 * Create a LanguageModel from an AppModelConfig, through llm-connect's
 * `createModel`: a custom endpoint goes through the "openai" provider with
 * Chat Completions; otherwise the provider identified by `providerNpm`
 * (`"openai"` when missing) is called at `providerApi`.
 *
 * That provider must be registered beforehand via {@link registerProvider}
 * (or `register()` from `llm-connect/providers/*`).
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
  return createSettingsModel({ ...config, model: config.model ?? "" });
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

/**
 * Map the columns of a suggested chart onto the real headers (case-insensitive).
 * Returns null when the X column, or the Y column of a non-count chart, does not exist;
 * an unknown group column is dropped.
 */
function matchChartColumns(
  raw: z.infer<typeof ChartSuggestionSchema>,
  headers: string[],
): z.infer<typeof ChartSuggestionSchema> | null {
  const find = (name: string | undefined) =>
    name === undefined
      ? undefined
      : headers.find((h) => h.toLowerCase() === name.trim().toLowerCase());
  const xColumn = find(raw.xColumn);
  const yColumn = find(raw.yColumn);
  if (!xColumn) return null;
  if (!yColumn && raw.aggregation !== "count") return null;
  return {
    ...raw,
    xColumn,
    yColumn: yColumn ?? raw.yColumn,
    groupColumn: find(raw.groupColumn),
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
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
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
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
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
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
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
  const { data, language, temperature = 0.5, signal, maxRetries } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: ChartSuggestionsResponseSchema,
      system: getChartSystemPrompt(data.headers, language),
      prompt: `Analyze this CSV data and suggest the best charts:\n\n${dataSummary}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    // Models sometimes invent column names: fix the case or drop the suggestion
    return object.charts.flatMap((s, i) => {
      const chart = matchChartColumns(s, data.headers);
      return chart ? [mapChartResult(chart, `chart-${i}-${Date.now()}`)] : [];
    });
  } catch (error) {
    throw toAIError(error);
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
  const {
    data,
    prompt,
    language,
    temperature = 0.5,
    signal,
    maxRetries,
  } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: SingleChartResponseSchema,
      system: getCustomChartPrompt(data.headers, language),
      prompt: `Data summary:\n${dataSummary}\n\nUser request: ${prompt}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return mapChartResult(object.chart, `chart-custom-${Date.now()}`);
  } catch (error) {
    throw toAIError(error);
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
    maxRetries,
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
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return mapChartResult(object.chart, failedChart.id);
  } catch (error) {
    throw toAIError(error);
  }
}
