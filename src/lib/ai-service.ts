import { generateText, generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_MODEL, type ModelId, type LanguageCode } from "./ai-models";

export type ChartType = "bar" | "line" | "pie" | "scatter" | "area";
export type AggregationType = "sum" | "avg" | "count" | "min" | "max" | "none";

export interface ChartSuggestion {
  id: string;
  type: ChartType;
  title: string;
  description: string;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  aggregation: AggregationType;
  // New: pre-computed data for the chart
  dataConfig: {
    xColumn: string;
    yColumn: string;
    groupColumn?: string;
  };
}

export interface AIServiceConfig {
  apiKey: string;
  model?: ModelId;
  language?: LanguageCode;
}

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

export interface CustomAnalysisResult {
  response: string;
}

// ============ Zod Schemas ============

const ChartSuggestionSchema = z.object({
  type: z.enum(["bar", "line", "pie", "scatter", "area"]),
  title: z.string(),
  description: z.string(),
  xColumn: z.string().describe("The EXACT column name to use for X axis (categories/labels)"),
  yColumn: z.string().describe("The EXACT column name to use for Y axis (values)"),
  groupColumn: z.string().optional().describe("Optional column to group/segment the data"),
  aggregation: z.enum(["sum", "avg", "count", "min", "max", "none"]).describe("How to aggregate Y values when there are duplicates in X"),
  reasoning: z.string().describe("Brief explanation of why this chart is useful for this data"),
});

const ChartSuggestionsResponseSchema = z.object({
  charts: z.array(ChartSuggestionSchema),
});

const SingleChartResponseSchema = z.object({
  chart: ChartSuggestionSchema,
});

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

// ============ Language Support ============

const LANGUAGE_INSTRUCTION: Record<LanguageCode, string> = {
  en: "Respond in English.",
  fr: "Réponds en français.",
  de: "Antworte auf Deutsch.",
  es: "Responde en español.",
  it: "Rispondi in italiano.",
  pt: "Responda em português.",
  nl: "Antwoord in het Nederlands.",
  ja: "日本語で回答してください。",
  zh: "请用中文回答。",
};

// ============ Prompts ============

const getChartSystemPrompt = (language: LanguageCode, columns: string[]) => `You are a data visualization expert. ${LANGUAGE_INSTRUCTION[language]}

You will analyze CSV data and suggest the best charts to visualize it.

AVAILABLE COLUMNS (use these EXACT names):
${columns.map(c => `- "${c}"`).join("\n")}

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

const getDataSummaryPrompt = (language: LanguageCode) => `You are a data analyst. ${LANGUAGE_INSTRUCTION[language]}

Analyze the provided CSV data summary and provide:
1. A comprehensive summary of what this dataset represents (2-3 sentences)
2. 3-5 key insights or patterns you notice
3. An assessment of data quality (completeness, consistency)`;

const getAnomalyPrompt = (language: LanguageCode) => `You are a data quality expert. ${LANGUAGE_INSTRUCTION[language]}

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

const getCustomAnalysisPrompt = (language: LanguageCode) => `You are a data analysis expert. ${LANGUAGE_INSTRUCTION[language]}

The user will ask questions about a CSV dataset. Respond clearly and precisely.`;

const getCustomChartPrompt = (language: LanguageCode, columns: string[]) => `You are a data visualization expert. ${LANGUAGE_INSTRUCTION[language]}

Create a chart configuration based on the user's request.

AVAILABLE COLUMNS (use these EXACT names):
${columns.map(c => `- "${c}"`).join("\n")}

IMPORTANT: Column names MUST exactly match the list above.`;

// ============ Provider Helper ============

function getModel(config: AIServiceConfig) {
  const openai = createOpenAI({ apiKey: config.apiKey });
  return openai(config.model ?? DEFAULT_MODEL);
}

// ============ Chart Suggestions ============

export const generateChartSuggestions = async (
  config: AIServiceConfig,
  dataSummary: string,
  columns: string[]
): Promise<ChartSuggestion[]> => {
  const model = getModel(config);
  const language = config.language ?? "en";

  const { object } = await generateObject({
    model,
    schema: ChartSuggestionsResponseSchema,
    system: getChartSystemPrompt(language, columns),
    prompt: `Analyze this CSV data and suggest the best charts:\n\n${dataSummary}`,
    temperature: 0.5,
  });

  return object.charts.map((s, i) => ({
    id: `chart-${i}-${Date.now()}`,
    type: s.type,
    title: s.title,
    description: s.description,
    xAxis: s.xColumn,
    yAxis: s.yColumn,
    groupBy: s.groupColumn,
    aggregation: s.aggregation,
    dataConfig: {
      xColumn: s.xColumn,
      yColumn: s.yColumn,
      groupColumn: s.groupColumn,
    },
  }));
};

// ============ Custom Chart ============

export const generateCustomChart = async (
  config: AIServiceConfig,
  dataSummary: string,
  userPrompt: string,
  columns: string[]
): Promise<ChartSuggestion | null> => {
  const model = getModel(config);
  const language = config.language ?? "en";

  try {
    const { object } = await generateObject({
      model,
      schema: SingleChartResponseSchema,
      system: getCustomChartPrompt(language, columns),
      prompt: `Data summary:\n${dataSummary}\n\nUser request: ${userPrompt}`,
      temperature: 0.5,
    });

    return {
      id: `chart-custom-${Date.now()}`,
      type: object.chart.type,
      title: object.chart.title,
      description: object.chart.description,
      xAxis: object.chart.xColumn,
      yAxis: object.chart.yColumn,
      groupBy: object.chart.groupColumn,
      aggregation: object.chart.aggregation,
      dataConfig: {
        xColumn: object.chart.xColumn,
        yColumn: object.chart.yColumn,
        groupColumn: object.chart.groupColumn,
      },
    };
  } catch {
    return null;
  }
};

// ============ Chart Repair ============

export const repairChartSuggestion = async (
  config: AIServiceConfig,
  failedChart: ChartSuggestion,
  columns: string[],
  errorContext: string
): Promise<ChartSuggestion | null> => {
  const model = getModel(config);
  const language = config.language ?? "en";

  try {
    const { object } = await generateObject({
      model,
      schema: SingleChartResponseSchema,
      system: getCustomChartPrompt(language, columns),
      prompt: `The following chart configuration failed to render:\n${JSON.stringify(failedChart, null, 2)}\n\nError context: ${errorContext}\n\nPlease fix the configuration to use valid columns and aggregation. Available columns: ${columns.join(", ")}`,
      temperature: 0.3, // Lower temperature for more deterministic repair
    });

    return {
      id: failedChart.id, // Keep same ID to replace in place
      type: object.chart.type,
      title: object.chart.title,
      description: object.chart.description,
      xAxis: object.chart.xColumn,
      yAxis: object.chart.yColumn,
      groupBy: object.chart.groupColumn,
      aggregation: object.chart.aggregation,
      dataConfig: {
        xColumn: object.chart.xColumn,
        yColumn: object.chart.yColumn,
        groupColumn: object.chart.groupColumn,
      },
    };
  } catch {
    return null;
  }
};

// ============ Data Summary ============

export const generateDataSummary = async (
  config: AIServiceConfig,
  dataSummary: string
): Promise<DataSummaryResult> => {
  const model = getModel(config);
  const language = config.language ?? "en";

  try {
    const { object } = await generateObject({
      model,
      schema: DataSummarySchema,
      system: getDataSummaryPrompt(language),
      prompt: `Here is the data to analyze:\n\n${dataSummary}`,
      temperature: 0.5,
    });

    return {
      summary: object.summary,
      keyInsights: object.keyInsights,
      dataQuality: object.dataQuality,
    };
  } catch {
    return {
      summary: "Failed to generate summary",
      keyInsights: [],
      dataQuality: "Not evaluated",
    };
  }
};

// ============ Anomaly Detection ============

export const detectAnomalies = async (
  config: AIServiceConfig,
  dataSummary: string,
  sampleRows: string
): Promise<AnomalyResult[]> => {
  const model = getModel(config);
  const language = config.language ?? "en";

  try {
    const { object } = await generateObject({
      model,
      schema: AnomaliesResponseSchema,
      system: getAnomalyPrompt(language),
      prompt: `Data summary:\n${dataSummary}\n\nData to analyze (CSV format):\n${sampleRows}`,
      temperature: 0.3,
    });

    return object.anomalies;
  } catch {
    return [];
  }
};

// ============ Custom Analysis ============

export const runCustomAnalysis = async (
  config: AIServiceConfig,
  customPrompt: string,
  dataSummary: string
): Promise<CustomAnalysisResult> => {
  const model = getModel(config);
  const language = config.language ?? "en";

  const { text } = await generateText({
    model,
    system: getCustomAnalysisPrompt(language),
    prompt: `Here is the data:\n\n${dataSummary}\n\nUser question: ${customPrompt}`,
    temperature: 0.5,
  });

  return { response: text };
};

// ============ Streaming Custom Analysis ============

export const streamCustomAnalysis = async (
  config: AIServiceConfig,
  customPrompt: string,
  dataSummary: string,
  onChunk: (chunk: string) => void,
  onComplete: (fullText: string) => void,
  conversationHistory: Array<{ prompt: string; response: string }> = []
): Promise<void> => {
  const { streamText } = await import("ai");
  const openai = createOpenAI({ apiKey: config.apiKey });
  const model = openai(config.model ?? DEFAULT_MODEL);
  const language = config.language ?? "en";

  // Format history for context
  const historyText = conversationHistory
    .map((item) => `User: ${item.prompt}\nAI: ${item.response}`)
    .join("\n\n");

  const contextPrompt = historyText
    ? `Previous conversation history:\n${historyText}\n\n`
    : "";

  const result = streamText({
    model,
    system: getCustomAnalysisPrompt(language),
    prompt: `Here is the data:\n\n${dataSummary}\n\n${contextPrompt}User question: ${customPrompt}`,
    temperature: 0.5,
  });

  let fullText = "";

  for await (const textPart of result.textStream) {
    fullText += textPart;
    onChunk(textPart);
  }

  onComplete(fullText);
};

