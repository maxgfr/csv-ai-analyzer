import { parseNumericValue } from "./values";
import type {
  TabularData,
  ChartConfig,
  SortOrder,
  ChartDataPoint,
} from "./types";

export interface ProcessedChartResult {
  data: ChartDataPoint[];
  seriesKeys: string[];
  yKey: string;
}

export const processChartData = (
  data: TabularData,
  chart: ChartConfig,
  sortOrder: SortOrder = "none",
  limit = 20,
): ChartDataPoint[] => {
  const result = processChartDataMultiSeries(data, chart, sortOrder, limit);
  return result.data;
};

export const processChartDataMultiSeries = (
  data: TabularData,
  chart: ChartConfig,
  sortOrder: SortOrder = "none",
  limit = 20,
): ProcessedChartResult => {
  const result: ChartDataPoint[] = [];
  if (limit <= 0 || Number.isNaN(limit))
    return { data: [], seriesKeys: [], yKey: chart.yAxis };

  // Find actual columns (case-insensitive match)
  const xColDef = data.columns.find(
    (c) => c.name.toLowerCase() === chart.xAxis.toLowerCase(),
  );
  const yColDef = data.columns.find(
    (c) => c.name.toLowerCase() === chart.yAxis.toLowerCase(),
  );
  const groupColDef = chart.groupBy
    ? data.columns.find(
        (c) => c.name.toLowerCase() === chart.groupBy!.toLowerCase(),
      )
    : undefined;

  if (!xColDef) return { data: [], seriesKeys: [], yKey: chart.yAxis };

  const xCol = xColDef.name;
  const xIdx = xColDef.index;

  // For count aggregation, we don't need a valid Y column - we just count occurrences
  const isCountMode = chart.aggregation === "count";
  const rawYCol = yColDef?.name ?? "count";
  const yCol = rawYCol === xCol ? `${rawYCol} (value)` : rawYCol;
  const yIdx = yColDef?.index ?? -1;

  // GroupBy mode: create multi-series data (not supported for pie/scatter)
  const supportsGroupBy = chart.type !== "pie" && chart.type !== "scatter";
  if (
    supportsGroupBy &&
    groupColDef &&
    chart.aggregation &&
    chart.aggregation !== "none"
  ) {
    const groupIdx = groupColDef.index;
    const allGroups = new Set<string>();

    // Nested grouping: xVal -> groupVal -> stats
    const grouped = new Map<
      string,
      Map<string, { sum: number; count: number; min: number; max: number }>
    >();

    data.rows.forEach((row) => {
      const xVal = String(row[xIdx] ?? "").trim();
      const groupVal = String(row[groupIdx] ?? "").trim();
      if (!xVal || !groupVal) return;

      allGroups.add(groupVal);

      if (!grouped.has(xVal)) grouped.set(xVal, new Map());
      const xGroup = grouped.get(xVal)!;

      if (isCountMode) {
        let current = xGroup.get(groupVal);
        if (!current) {
          current = { sum: 0, count: 0, min: 0, max: 0 };
          xGroup.set(groupVal, current);
        }
        current.count++;
      } else if (yIdx >= 0) {
        const yVal = parseNumericValue(row[yIdx] ?? "");
        if (yVal !== null) {
          let current = xGroup.get(groupVal);
          if (!current) {
            current = { sum: 0, count: 0, min: Infinity, max: -Infinity };
            xGroup.set(groupVal, current);
          }
          current.sum += yVal;
          current.count++;
          if (yVal < current.min) current.min = yVal;
          if (yVal > current.max) current.max = yVal;
        }
      }
    });

    const groupNames = Array.from(allGroups).slice(0, 8);
    const occupied = new Set([xCol, ...allGroups]);
    const seriesKeys = groupNames.map((name) => {
      if (name !== xCol) return name;
      let key = `${name} (series)`;
      let suffix = 2;
      while (occupied.has(key)) key = `${name} (series ${suffix++})`;
      occupied.add(key);
      return key;
    });

    grouped.forEach((groupMap, xKey) => {
      const point: ChartDataPoint = { [xCol]: xKey };
      seriesKeys.forEach((groupKey, index) => {
        const stats = groupMap.get(groupNames[index]!);
        if (stats) {
          let value: number;
          switch (chart.aggregation) {
            case "sum":
              value = stats.sum;
              break;
            case "avg":
              value = stats.count > 0 ? stats.sum / stats.count : 0;
              break;
            case "count":
              value = stats.count;
              break;
            case "min":
              value = stats.min === Infinity ? 0 : stats.min;
              break;
            case "max":
              value = stats.max === -Infinity ? 0 : stats.max;
              break;
            default:
              value = stats.sum;
          }
          Object.defineProperty(point, groupKey, {
            value: Math.round(value * 100) / 100,
            enumerable: true,
            configurable: true,
          });
        } else {
          Object.defineProperty(point, groupKey, {
            value: 0,
            enumerable: true,
            configurable: true,
          });
        }
      });
      result.push(point);
    });

    // Sort by first series value or alphabetically
    if (sortOrder !== "none" && seriesKeys[0]) {
      const firstKey = seriesKeys[0];
      result.sort((a, b) => {
        const aVal = (a[firstKey] as number) ?? 0;
        const bVal = (b[firstKey] as number) ?? 0;
        return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
      });
    }

    return {
      data: result.slice(0, limit),
      seriesKeys,
      yKey: yCol,
    };
  }

  // Standard single-series mode (existing logic)
  if (chart.aggregation && chart.aggregation !== "none") {
    const groups = new Map<
      string,
      { sum: number; count: number; min: number; max: number }
    >();

    data.rows.forEach((row) => {
      const xVal = String(row[xIdx] ?? "").trim();
      if (!xVal) return;

      if (isCountMode) {
        let current = groups.get(xVal);
        if (!current) {
          current = { sum: 0, count: 0, min: 0, max: 0 };
          groups.set(xVal, current);
        }
        current.count++;
      } else if (yIdx >= 0) {
        const yVal = parseNumericValue(row[yIdx] ?? "");
        if (yVal !== null) {
          let current = groups.get(xVal);
          if (!current) {
            current = { sum: 0, count: 0, min: Infinity, max: -Infinity };
            groups.set(xVal, current);
          }
          current.sum += yVal;
          current.count++;
          if (yVal < current.min) current.min = yVal;
          if (yVal > current.max) current.max = yVal;
        }
      }
    });

    groups.forEach((stats, key) => {
      let value: number;
      switch (chart.aggregation) {
        case "sum":
          value = stats.sum;
          break;
        case "avg":
          value = stats.count > 0 ? stats.sum / stats.count : 0;
          break;
        case "count":
          value = stats.count;
          break;
        case "min":
          value = stats.min === Infinity ? 0 : stats.min;
          break;
        case "max":
          value = stats.max === -Infinity ? 0 : stats.max;
          break;
        default:
          value = stats.sum;
      }
      result.push({ [xCol]: key, [yCol]: Math.round(value * 100) / 100 });
    });
  } else if (yIdx >= 0) {
    for (const row of data.rows) {
      const value = parseNumericValue(row[yIdx] ?? "");
      if (value === null) continue;
      result.push({ [xCol]: row[xIdx] ?? "", [yCol]: value });
      if (sortOrder === "none" && result.length >= limit) break;
    }
  }

  // Apply sorting
  if (sortOrder !== "none") {
    result.sort((a, b) => {
      const aVal = a[yCol] as number;
      const bVal = b[yCol] as number;
      return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
    });
  }

  return {
    data: result.slice(0, limit),
    seriesKeys: [],
    yKey: yCol,
  };
};
