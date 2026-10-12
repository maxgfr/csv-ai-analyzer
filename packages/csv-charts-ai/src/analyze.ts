import { generateObject, generateText, streamText } from "ai";
import { z } from "zod";
import type { TabularData, ChartConfig } from "./types";
import type { ModelInput } from "./ai";
import {
  clipCell,
  resolveModel,
  suggestCharts,
  summarizeTabularData,
  toAIError,
  validateTabularData,
} from "./ai";

// ============ Schemas ============

const DataSummarySchema = z.object({
  summary: z.string(),
  keyInsights: z.array(z.string()),
  dataQuality: z.string(),
});

const AnomalySchema = z.object({
  row: z.number(),
  column: z.string(),
  value: z.string(),
  issue: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

const AnomaliesResponseSchema = z.object({
  anomalies: z.array(AnomalySchema),
});

// ============ Result Types ============

export interface DataSummaryResult {
  summary: string;
  keyInsights: string[];
  dataQuality: string;
}

export interface AnomalyResult {
  row: number;
  column: string;
  value: string;
  issue: string;
  severity: "low" | "medium" | "high";
}

export interface AnalysisResult {
  summary: DataSummaryResult;
  anomalies: AnomalyResult[];
  charts: ChartConfig[];
}

// ============ Prompts ============

const summarySystemPrompt = (
  language?: string,
) => `You are a data analyst.${language ? ` Respond in ${language}.` : ""}

Analyze the provided CSV data summary and provide:
1. A comprehensive summary of what this dataset represents (2-3 sentences)
2. 3-5 key insights or patterns you notice
3. An assessment of data quality (completeness, consistency)`;

const anomalySystemPrompt = (
  language?: string,
) => `You are a data quality expert.${language ? ` Respond in ${language}.` : ""}

Analyze the provided CSV data and identify anomalies, outliers, or suspicious data points.

For each anomaly found, provide:
1. Row number (1-indexed, excluding header)
2. Column name
3. The problematic value
4. Description of the issue
5. Severity (low, medium, high)

Look for:
- Missing or empty values where data is expected
- Values that don't match the expected type
- Outliers (extremely high or low values)
- Inconsistent formatting
- Invalid dates or formats

Analyze ALL rows provided. Return empty array if no anomalies found.`;

const questionSystemPrompt = (language?: string) =>
  `You are a data analysis expert.${language ? ` Respond in ${language}.` : ""}\n\nThe user will ask questions about a CSV dataset. Respond clearly and precisely.`;

// ============ Helper ============

function escapeCSVField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildSampleCSV(data: TabularData, maxRows = 50): string {
  const cell = (value: string) => escapeCSVField(clipCell(value));
  const header = data.headers.map(cell).join(",");
  const rows = data.rows
    .slice(0, maxRows)
    .map((row) => row.map(cell).join(","))
    .join("\n");
  return `${header}\n${rows}`;
}

/** One question/answer pair of a chat about the data. */
export interface ChatHistoryItem {
  prompt: string;
  response: string;
  /** Failed answers are not sent back to the model. */
  error?: boolean;
}

/** Most previous turns sent back to the model. */
export const MAX_HISTORY_TURNS = 10;
/** Character budget of the conversation history in a prompt. */
export const MAX_HISTORY_CHARS = 12_000;

/**
 * Keep the most recent successful turns that fit the budget, oldest first.
 * Failed or empty answers are left out.
 */
export function buildHistoryContext(
  history: ChatHistoryItem[],
  maxTurns = MAX_HISTORY_TURNS,
  maxChars = MAX_HISTORY_CHARS,
): string {
  const turns: string[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && turns.length < maxTurns; i--) {
    const item = history[i]!;
    if (item.error || !item.response.trim()) continue;
    const turn = `User: ${item.prompt}\nAI: ${item.response}`;
    if (used + turn.length > maxChars) break;
    used += turn.length;
    turns.unshift(turn);
  }
  return turns.length
    ? `Previous conversation history:\n${turns.join("\n\n")}\n\n`
    : "";
}

// ============ Individual Functions ============

export interface SummarizeDataOptions {
  model: ModelInput;
  data: TabularData;
  dataSummary?: string;
  language?: string;
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
}

/**
 * Generate an AI summary of tabular data.
 *
 * @example
 * ```ts
 * const result = await summarizeData({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 * });
 * console.log(result.summary);
 * console.log(result.keyInsights);
 * console.log(result.dataQuality);
 * ```
 */
export async function summarizeData(
  options: SummarizeDataOptions,
): Promise<DataSummaryResult> {
  const { data, language, temperature = 0.5, signal, maxRetries } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: DataSummarySchema,
      system: summarySystemPrompt(language),
      prompt: `Here is the data to analyze:\n\n${dataSummary}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return {
      summary: object.summary,
      keyInsights: object.keyInsights,
      dataQuality: object.dataQuality,
    };
  } catch (error) {
    throw toAIError(error);
  }
}

export interface DetectAnomaliesOptions {
  model: ModelInput;
  data: TabularData;
  dataSummary?: string;
  /** Max rows to send for analysis (default: 50) */
  maxRows?: number;
  language?: string;
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
}

/**
 * Detect anomalies in tabular data using AI.
 *
 * @example
 * ```ts
 * const anomalies = await detectAnomalies({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 * });
 * anomalies.forEach(a => console.log(`Row ${a.row}: ${a.issue}`));
 * ```
 */
export async function detectAnomalies(
  options: DetectAnomaliesOptions,
): Promise<AnomalyResult[]> {
  const {
    data,
    maxRows = 50,
    language,
    temperature = 0.3,
    signal,
    maxRetries,
  } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const sampleCSV = buildSampleCSV(data, maxRows);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: AnomaliesResponseSchema,
      system: anomalySystemPrompt(language),
      prompt: `Data summary:\n${dataSummary}\n\nData to analyze (CSV format):\n${sampleCSV}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return object.anomalies;
  } catch (error) {
    throw toAIError(error);
  }
}

export interface AskAboutDataOptions {
  model: ModelInput;
  data: TabularData;
  question: string;
  dataSummary?: string;
  /** Previous conversation messages for context (the latest turns that fit a budget are sent) */
  history?: ChatHistoryItem[];
  language?: string;
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
}

/**
 * Ask a question about the data and get a text response.
 *
 * @example
 * ```ts
 * const answer = await askAboutData({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 *   question: "What is the average revenue by category?",
 * });
 * console.log(answer);
 * ```
 */
export async function askAboutData(
  options: AskAboutDataOptions,
): Promise<string> {
  const {
    data,
    question,
    history = [],
    language,
    temperature = 0.5,
    signal,
    maxRetries,
  } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);
    const contextPrompt = buildHistoryContext(history);

    const { text } = await generateText({
      model,
      system: questionSystemPrompt(language),
      prompt: `Here is the data:\n\n${dataSummary}\n\n${contextPrompt}User question: ${question}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return text;
  } catch (error) {
    throw toAIError(error);
  }
}

export interface StreamAskAboutDataOptions extends Omit<
  AskAboutDataOptions,
  "signal"
> {
  onChunk: (chunk: string) => void;
  onComplete: (fullText: string) => void;
  /** AbortSignal to cancel the stream */
  signal?: AbortSignal;
}

/**
 * Ask a question with streaming response.
 *
 * @example
 * ```ts
 * await streamAskAboutData({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 *   question: "What trends do you see?",
 *   onChunk: (chunk) => process.stdout.write(chunk),
 *   onComplete: (full) => console.log("\nDone:", full.length, "chars"),
 * });
 * ```
 */
export async function streamAskAboutData(
  options: StreamAskAboutDataOptions,
): Promise<void> {
  const {
    data,
    question,
    history = [],
    language,
    temperature = 0.5,
    signal,
    maxRetries,
    onChunk,
    onComplete,
  } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);
    const contextPrompt = buildHistoryContext(history);

    let streamError: Error | null = null;

    const result = streamText({
      model,
      system: questionSystemPrompt(language),
      prompt: `Here is the data:\n\n${dataSummary}\n\n${contextPrompt}User question: ${question}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
      onError: ({ error }) => {
        streamError = error instanceof Error ? error : new Error(String(error));
      },
    });

    let fullText = "";

    for await (const textPart of result.textStream) {
      fullText += textPart;
      onChunk(textPart);
    }

    if (streamError) throw streamError;

    const finishReason = await result.finishReason;
    if (finishReason === "error") {
      throw new Error(
        "The AI model encountered an error while generating the response.",
      );
    }

    onComplete(fullText);
  } catch (error) {
    throw toAIError(error);
  }
}

// ============ Full Pipeline ============

export interface AnalyzeOptions {
  model: ModelInput;
  data: TabularData;
  dataSummary?: string;
  language?: string;
  /** Set to false to skip anomaly detection (default: true) */
  detectAnomalies?: boolean;
  /** Set to false to skip chart suggestions (default: true) */
  suggestCharts?: boolean;
  /** AbortSignal to cancel all parallel requests */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). */
  maxRetries?: number;
}

/**
 * Run a complete AI analysis on tabular data in one call.
 * Returns summary, anomalies, and chart suggestions.
 *
 * @example
 * ```ts
 * import { analyzeData, ChartDisplay } from "csv-charts-ai";
 *
 * const result = await analyzeData({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myCSVData,
 * });
 *
 * console.log(result.summary.keyInsights);
 * console.log(`Found ${result.anomalies.length} anomalies`);
 *
 * // Render charts
 * <ChartDisplay data={myCSVData} charts={result.charts} />
 * ```
 */
export async function analyzeData(
  options: AnalyzeOptions,
): Promise<AnalysisResult> {
  const {
    data,
    language,
    signal,
    detectAnomalies: runAnomalies = true,
    suggestCharts: runCharts = true,
    maxRetries,
  } = options;
  try {
    validateTabularData(data);
  } catch (error) {
    throw toAIError(error);
  }
  const dataSummary = options.dataSummary ?? summarizeTabularData(data);

  // The first failure cancels the sibling requests instead of letting them run on
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  const shared = {
    model: options.model,
    data,
    dataSummary,
    language,
    signal: controller.signal,
    maxRetries,
  };
  const cancelOnFailure = <T>(promise: Promise<T>) =>
    promise.catch((error: unknown) => {
      controller.abort(error);
      throw error;
    });

  try {
    // Run all in parallel
    const [summary, anomalies, charts] = await Promise.all([
      cancelOnFailure(summarizeData(shared)),
      runAnomalies
        ? cancelOnFailure(detectAnomalies(shared))
        : Promise.resolve([]),
      runCharts ? cancelOnFailure(suggestCharts(shared)) : Promise.resolve([]),
    ]);
    return { summary, anomalies, charts };
  } finally {
    signal?.removeEventListener("abort", forwardAbort);
  }
}

// ============ Question Suggestions ============

const questionsSystemPrompt = (
  language?: string,
) => `You are a data analysis expert.${language ? ` Respond in ${language}.` : ""}

Given a dataset summary, suggest insightful questions that a user could ask to better understand their data. Focus on:
- Trends and patterns
- Comparisons and rankings
- Correlations between columns
- Outliers and anomalies
- Actionable business insights

Each question should be specific to the data columns available.`;

const QuestionsResponseSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().describe("The question to ask about the data"),
        category: z
          .enum(["trend", "comparison", "correlation", "anomaly", "insight"])
          .describe("Category of the question"),
      }),
    )
    .describe("5-8 suggested questions"),
});

export interface SuggestQuestionsOptions {
  model: ModelInput;
  data: TabularData;
  dataSummary?: string;
  language?: string;
  /** Number of questions to suggest (default: 6) */
  count?: number;
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
}

export interface SuggestedQuestion {
  question: string;
  category: "trend" | "comparison" | "correlation" | "anomaly" | "insight";
}

/**
 * Suggest interesting questions a user could ask about their data.
 * Great for onboarding users who don't know where to start with their dataset.
 *
 * @example
 * ```ts
 * const questions = await suggestQuestions({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 * });
 *
 * questions.forEach(q => console.log(`[${q.category}] ${q.question}`));
 * // [trend] How has revenue changed over the last 6 months?
 * // [comparison] Which product category generates the most revenue?
 * // [correlation] Is there a relationship between price and quantity sold?
 * ```
 */
export async function suggestQuestions(
  options: SuggestQuestionsOptions,
): Promise<SuggestedQuestion[]> {
  const {
    data,
    language,
    count = 6,
    temperature = 0.7,
    signal,
    maxRetries,
  } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: QuestionsResponseSchema,
      system: questionsSystemPrompt(language),
      prompt: `Here is the dataset to analyze:\n\n${dataSummary}\n\nSuggest ${count} insightful questions about this data.`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return object.questions.slice(0, count);
  } catch (error) {
    throw toAIError(error);
  }
}
