import type { ChartConfig } from "csv-charts-ai";
import type { CSVData } from "./csv-parser";
export function validateChart(
  data: CSVData,
  chart: ChartConfig,
): string | null {
  if (!data.rows.length) return "No rows to chart. Adjust your filters first.";
  const find = (name: string) =>
    data.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const x = find(chart.xAxis),
    y = find(chart.yAxis);
  if (!x) return "Choose an X column from the current dataset.";
  if (chart.aggregation !== "count" && (!y || y.type !== "number"))
    return "Choose a numeric Y column, or use Count to count rows.";
  if (
    chart.type === "scatter" &&
    (x.type !== "number" || chart.aggregation !== "none")
  )
    return "Scatter charts need a numeric X column and no aggregation.";
  return null;
}
