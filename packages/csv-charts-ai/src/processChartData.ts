import {
  detectDateOrder,
  parseDateValue,
  parseNumericValue,
  roundSignificant,
  sampleEvenly,
} from "./values";
import type {
  TabularData,
  ChartConfig,
  SortOrder,
  ChartDataPoint,
} from "./types";

type ColumnInfo = TabularData["columns"][number];

export interface ProcessedChartResult {
  data: ChartDataPoint[];
  seriesKeys: string[];
  yKey: string;
}

/** Most points drawn on a scatter chart (spread evenly over the data). */
export const SCATTER_POINT_LIMIT = 2000;
/** Most series drawn for a grouped chart: the groups with the largest totals. */
export const MAX_SERIES = 8;
/** Label of the pie slice that sums every category beyond the limit. */
export const OTHER_LABEL = "Other";

interface Stats {
  sum: number;
  count: number;
  min: number;
  max: number;
}

const newStats = (): Stats => ({
  sum: 0,
  count: 0,
  min: Infinity,
  max: -Infinity,
});

function accumulate(stats: Stats, value: number | null) {
  stats.count++;
  if (value === null) return;
  stats.sum += value;
  if (value < stats.min) stats.min = value;
  if (value > stats.max) stats.max = value;
}

function aggregate(stats: Stats, aggregation: ChartConfig["aggregation"]) {
  switch (aggregation) {
    case "avg":
      return stats.count > 0 ? stats.sum / stats.count : 0;
    case "count":
      return stats.count;
    case "min":
      return stats.min === Infinity ? 0 : stats.min;
    case "max":
      return stats.max === -Infinity ? 0 : stats.max;
    default:
      return stats.sum;
  }
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
  const aggregated = !!chart.aggregation && chart.aggregation !== "none";
  const chronological =
    (chart.type === "line" || chart.type === "area") &&
    (xColDef.type === "date" || xColDef.type === "number");

  // GroupBy mode: create multi-series data (not supported for pie/scatter)
  const supportsGroupBy = chart.type !== "pie" && chart.type !== "scatter";
  if (supportsGroupBy && groupColDef && aggregated) {
    const groupIdx = groupColDef.index;
    const groupTotals = new Map<string, number>();

    // Nested grouping: xVal -> groupVal -> stats
    const grouped = new Map<string, Map<string, Stats>>();

    for (const row of data.rows) {
      const xVal = String(row[xIdx] ?? "").trim();
      const groupVal = String(row[groupIdx] ?? "").trim();
      if (!xVal || !groupVal) continue;
      const yVal = isCountMode ? null : parseNumericValue(row[yIdx] ?? "");
      if (!isCountMode && yVal === null) continue;

      let xGroup = grouped.get(xVal);
      if (!xGroup) grouped.set(xVal, (xGroup = new Map()));
      let stats = xGroup.get(groupVal);
      if (!stats) xGroup.set(groupVal, (stats = newStats()));
      accumulate(stats, yVal);
      groupTotals.set(
        groupVal,
        (groupTotals.get(groupVal) ?? 0) + (isCountMode ? 1 : Math.abs(yVal!)),
      );
    }

    // Keep the groups that weigh the most, not the first ones seen
    const groupNames = [...groupTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SERIES)
      .map(([name]) => name);
    const occupied = new Set([xCol, ...groupTotals.keys()]);
    const seriesKeys = groupNames.map((name) => {
      if (name !== xCol) return name;
      let key = `${name} (series)`;
      let suffix = 2;
      while (occupied.has(key)) key = `${name} (series ${suffix++})`;
      occupied.add(key);
      return key;
    });

    const points: ChartDataPoint[] = [];
    const totals = new Map<ChartDataPoint, number>();
    grouped.forEach((groupMap, xKey) => {
      const point: ChartDataPoint = { [xCol]: xKey };
      let total = 0;
      seriesKeys.forEach((groupKey, index) => {
        const stats = groupMap.get(groupNames[index]!);
        // A group with no data at this x is a gap, not a zero
        const value = stats
          ? roundSignificant(aggregate(stats, chart.aggregation))
          : null;
        if (value !== null) total += value;
        Object.defineProperty(point, groupKey, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      });
      totals.set(point, total);
      points.push(point);
    });

    return {
      data: selectPoints(points, (p) => totals.get(p) ?? 0, sortOrder, limit, {
        chronological,
        xCol,
        xColDef,
      }),
      seriesKeys,
      yKey: yCol,
    };
  }

  const points: ChartDataPoint[] = [];
  if (aggregated) {
    const groups = new Map<string, Stats>();
    for (const row of data.rows) {
      const xVal = String(row[xIdx] ?? "").trim();
      if (!xVal) continue;
      const yVal = isCountMode ? null : parseNumericValue(row[yIdx] ?? "");
      if (!isCountMode && yVal === null) continue;
      let stats = groups.get(xVal);
      if (!stats) groups.set(xVal, (stats = newStats()));
      accumulate(stats, yVal);
    }
    groups.forEach((stats, key) => {
      points.push({
        [xCol]: key,
        [yCol]: roundSignificant(aggregate(stats, chart.aggregation)),
      });
    });
  } else if (yIdx >= 0) {
    for (const row of data.rows) {
      const value = parseNumericValue(row[yIdx] ?? "");
      if (value === null) continue;
      points.push({ [xCol]: row[xIdx] ?? "", [yCol]: value });
    }
  }

  if (chart.type === "scatter")
    return {
      data: scatterPoints(points, xCol, xColDef),
      seriesKeys: [],
      yKey: yCol,
    };

  const valueOf = (p: ChartDataPoint) => (p[yCol] as number | null) ?? 0;
  let selected = selectPoints(points, valueOf, sortOrder, limit, {
    chronological,
    xCol,
    xColDef,
  });

  // A pie must still add up to the whole: fold the remaining categories into one slice
  const additive =
    chart.aggregation === "sum" || chart.aggregation === "count" || !aggregated;
  if (chart.type === "pie" && additive && points.length > selected.length) {
    const total = points.reduce((sum, p) => sum + valueOf(p), 0);
    const shown = selected.reduce((sum, p) => sum + valueOf(p), 0);
    selected = [
      ...selected,
      { [xCol]: OTHER_LABEL, [yCol]: roundSignificant(total - shown) },
    ];
  }

  return { data: selected, seriesKeys: [], yKey: yCol };
};

/**
 * Sort by value when asked; otherwise keep the `limit` largest points ("Top N")
 * in their original order, or in x order for line/area charts over dates or numbers.
 */
function selectPoints(
  points: ChartDataPoint[],
  valueOf: (point: ChartDataPoint) => number,
  sortOrder: SortOrder,
  limit: number,
  x: { chronological: boolean; xCol: string; xColDef: ColumnInfo },
): ChartDataPoint[] {
  if (sortOrder !== "none")
    return [...points]
      .sort((a, b) =>
        sortOrder === "desc"
          ? valueOf(b) - valueOf(a)
          : valueOf(a) - valueOf(b),
      )
      .slice(0, limit);

  let kept = points;
  if (points.length > limit) {
    const top = new Set(
      [...points].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, limit),
    );
    kept = points.filter((p) => top.has(p));
  }
  if (!x.chronological) return kept;

  const labels = kept.map((p) => String(p[x.xCol] ?? ""));
  // One day/month order for the whole column, not just the points kept
  const order =
    x.xColDef.type === "date"
      ? detectDateOrder(points.map((p) => String(p[x.xCol] ?? "")))
      : undefined;
  const keys = labels.map((label) =>
    x.xColDef.type === "date"
      ? parseDateValue(label, order)
      : parseNumericValue(label),
  );
  return kept
    .map((point, i) => ({ point, key: keys[i] ?? null }))
    .sort((a, b) =>
      a.key === null || b.key === null
        ? (a.key === null ? 1 : 0) - (b.key === null ? 1 : 0)
        : a.key - b.key,
    )
    .map(({ point }) => point);
}

/** Scatter keeps every point (up to a cap) with a numeric x when the column is numeric. */
function scatterPoints(
  points: ChartDataPoint[],
  xCol: string,
  xColDef: ColumnInfo,
): ChartDataPoint[] {
  const numeric = xColDef.type === "number";
  const result: ChartDataPoint[] = [];
  for (const point of points) {
    const raw = String(point[xCol] ?? "").trim();
    const x = numeric ? parseNumericValue(raw) : raw;
    if (x === null || x === "") continue;
    result.push({ ...point, [xCol]: x });
  }
  return sampleEvenly(result, SCATTER_POINT_LIMIT);
}
