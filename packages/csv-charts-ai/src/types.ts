export type ChartType = "bar" | "line" | "pie" | "scatter" | "area";
export type AggregationType = "sum" | "avg" | "count" | "min" | "max" | "none";

export interface TabularData {
  headers: string[];
  rows: string[][];
  columns: {
    name: string;
    type: "string" | "number" | "date" | "boolean";
    index: number;
  }[];
  rowCount: number;
}

export interface ChartConfig {
  id: string;
  type: ChartType;
  title: string;
  description: string;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  aggregation: AggregationType;
  dataConfig?: {
    xColumn: string;
    yColumn: string;
    groupColumn?: string;
  };
}

export type SortOrder = "none" | "asc" | "desc";
/** One chart point. A series value is `null` when that group has no data at this x. */
export type ChartDataPoint = Record<string, string | number | null>;

// Theme types
export interface ChartTheme {
  colors: string[];
  background: string;
  cardBackground: string;
  border: string;
  text: string;
  textMuted: string;
  textDimmed: string;
  gridStroke: string;
  tooltipBackground: string;
  tooltipBorder: string;
  accentPrimary: string;
  accentSecondary: string;
  accentSuccess: string;
  accentDanger: string;
}

export const defaultDarkTheme: ChartTheme = {
  colors: [
    "#8b5cf6",
    "#06b6d4",
    "#f43f5e",
    "#eab308",
    "#10b981",
    "#3b82f6",
    "#d946ef",
    "#f97316",
  ],
  background: "rgba(15, 23, 42, 0.5)",
  cardBackground: "rgba(255, 255, 255, 0.05)",
  border: "rgba(255, 255, 255, 0.1)",
  text: "#ffffff",
  textMuted: "#9ca3af",
  textDimmed: "#6b7280",
  gridStroke: "#374151",
  tooltipBackground: "#1f2937",
  tooltipBorder: "1px solid #374151",
  accentPrimary: "#8b5cf6",
  accentSecondary: "#06b6d4",
  accentSuccess: "#10b981",
  accentDanger: "#ef4444",
};

export const defaultLightTheme: ChartTheme = {
  colors: [
    "#7c3aed",
    "#0891b2",
    "#e11d48",
    "#ca8a04",
    "#059669",
    "#2563eb",
    "#c026d3",
    "#ea580c",
  ],
  background: "#ffffff",
  cardBackground: "#f8fafc",
  border: "#e2e8f0",
  text: "#0f172a",
  textMuted: "#64748b",
  textDimmed: "#94a3b8",
  gridStroke: "#e2e8f0",
  tooltipBackground: "#ffffff",
  tooltipBorder: "1px solid #e2e8f0",
  accentPrimary: "#7c3aed",
  accentSecondary: "#0891b2",
  accentSuccess: "#059669",
  accentDanger: "#dc2626",
};
