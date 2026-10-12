/**
 * React chart components entry point.
 *
 * Import from "csv-charts-ai/charts" to use these components.
 * Requires peer dependencies: react, recharts. Icons are built in (see ChartIconProvider).
 *
 * @example
 * ```tsx
 * import { ChartDisplay, defaultDarkTheme } from "csv-charts-ai/charts";
 *
 * <ChartDisplay data={data} charts={charts} theme={defaultDarkTheme} />
 * ```
 */

// React components
export { ChartDisplay } from "./ChartDisplay";
export type { ChartDisplayProps } from "./ChartDisplay";
export { SingleChart } from "./SingleChart";
export type { SingleChartProps } from "./SingleChart";
export { ChartToolbar } from "./ChartToolbar";
export { ChartThemeProvider, useChartTheme } from "./ThemeContext";
export { ChartIconProvider, useChartIcons, defaultIcons } from "./IconContext";
export type { ChartIconSet, ChartIcon, ChartIconProps } from "./IconContext";

// Re-export types & themes needed for chart usage
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

// Re-export data processing (used internally by charts, also useful standalone)
export {
  processChartData,
  processChartDataMultiSeries,
} from "./processChartData";
export type { ProcessedChartResult } from "./processChartData";
export { COLORS } from "./constants";
