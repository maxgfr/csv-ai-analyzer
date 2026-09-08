// Version
export { VERSION } from "./version";

// Provider registry
export {
  registerProvider,
  registerProviders,
  fromSDK,
  getProvider,
  hasProvider,
  clearProviders,
} from "./providers";
export type { ProviderConfig, ProviderFactory } from "./providers";

// CSV parsing
export { parseCSV, detectCSVDelimiter } from "./csv-parser";
export type { ParseCSVOptions } from "./csv-parser";

// XLSX parsing
export { parseXLSX, convertXLSXRows, listXLSXSheets } from "./xlsx-parser";
export type { ParseXLSXOptions } from "./xlsx-parser";

// Data processing
export {
  processChartData,
  processChartDataMultiSeries,
} from "./processChartData";
export type { ProcessedChartResult } from "./processChartData";
export { COLORS } from "./constants";

// Types & themes
export type {
  ChartConfig,
  TabularData,
  ChartType,
  AggregationType,
  SortOrder,
  ChartDataPoint,
  ChartTheme,
} from "./types";
export { defaultDarkTheme, defaultLightTheme } from "./types";

// AI — chart generation
export { suggestCharts, suggestCustomChart, repairChart } from "./ai";
export {
  createModel,
  createAppModel,
  resolveModel,
  summarizeTabularData,
  generateDataSummary,
  getAIErrorMessage,
} from "./ai";
export { AIConfigSchema, TabularDataSchema } from "./ai";
export type {
  AIConfig,
  AppModelConfig,
  ModelInput,
  SuggestChartsOptions,
  SuggestCustomChartOptions,
  RepairChartOptions,
} from "./ai";

// CSV diff
export { computeDiff } from "./csv-diff";
export type {
  MatchMode,
  DiffStatus,
  DiffRow,
  DiffCounts,
  DiffResult,
  DiffOptions,
} from "./csv-diff";

// AI — data analysis
export {
  summarizeData,
  detectAnomalies,
  askAboutData,
  streamAskAboutData,
  analyzeData,
  suggestQuestions,
} from "./analyze";
export type {
  DataSummaryResult,
  AnomalyResult,
  AnalysisResult,
  SuggestedQuestion,
  SummarizeDataOptions,
  DetectAnomaliesOptions,
  AskAboutDataOptions,
  StreamAskAboutDataOptions,
  AnalyzeOptions,
  SuggestQuestionsOptions,
} from "./analyze";

export { analyzeDataQuality } from "./data-quality";
export type { DataQualityResult } from "./data-quality";
export {
  parseNumericValue,
  parseDateValue,
  inferValuesType,
  uniqueHeaders,
} from "./values";
