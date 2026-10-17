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
  const xKeyOf = dateBuckets(data, xColDef, chronological && aggregated, limit);
  const bucketed = xKeyOf !== plainKey;

  // GroupBy mode: create multi-series data (not supported for pie/scatter)
  const supportsGroupBy = chart.type !== "pie" && chart.type !== "scatter";
  if (supportsGroupBy && groupColDef && aggregated) {
    const groupIdx = groupColDef.index;
    const groupTotals = new Map<string, number>();

    // Nested grouping: xVal -> groupVal -> stats
    const grouped = new Map<string, Map<string, Stats>>();

    for (const row of data.rows) {
      const xVal = xKeyOf(String(row[xIdx] ?? ""));
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
        bucketed,
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
      const xVal = xKeyOf(String(row[xIdx] ?? ""));
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
    bucketed,
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

const plainKey = (raw: string) => raw.trim();

/**
 * The x value an aggregated trend over dates groups rows by: the date itself,
 * or its month ("2024-03") when there are more dates than `limit`, or its year
 * when there are still more months. Without it a year of daily rows would be
 * cut to its last `limit` days.
 */
function dateBuckets(
  data: TabularData,
  xColDef: ColumnInfo,
  enabled: boolean,
  limit: number,
): (raw: string) => string {
  if (!enabled || xColDef.type !== "date") return plainKey;
  const raws = data.rows.map((row) => String(row[xColDef.index] ?? "").trim());
  if (new Set(raws.filter(Boolean)).size <= limit) return plainKey;
  const order = detectDateOrder(raws);
  const isoOf = (raw: string) => {
    const time = parseDateValue(raw, order);
    return time === null ? null : new Date(time).toISOString();
  };
  const months = new Set<string>();
  for (const raw of raws) {
    const iso = isoOf(raw);
    if (iso) months.add(iso.slice(0, 7));
  }
  const length = months.size <= limit ? 7 : 4;
  return (raw) => isoOf(raw.trim())?.slice(0, length) ?? raw.trim();
}

/**
 * Sort by value when asked. Otherwise line/area charts over dates or numbers
 * keep the `limit` most recent points in x order (a trend needs consecutive
 * points), and other charts keep the `limit` largest points ("Top N") in their
 * original order.
 */
function selectPoints(
  points: ChartDataPoint[],
  valueOf: (point: ChartDataPoint) => number,
  sortOrder: SortOrder,
  limit: number,
  x: {
    chronological: boolean;
    /** x values are months or years ("2024-03", "2024"): their text order is chronological. */
    bucketed?: boolean;
    xCol: string;
    xColDef: ColumnInfo;
  },
): ChartDataPoint[] {
  if (sortOrder !== "none")
    return [...points]
      .sort((a, b) =>
        sortOrder === "desc"
          ? valueOf(b) - valueOf(a)
          : valueOf(a) - valueOf(b),
      )
      .slice(0, limit);

  if (x.chronological && x.bucketed)
    return [...points]
      .sort((a, b) => String(a[x.xCol]).localeCompare(String(b[x.xCol])))
      .slice(-limit);

  if (x.chronological) {
    const labels = points.map((p) => String(p[x.xCol] ?? ""));
    // One day/month order for the whole column
    const order =
      x.xColDef.type === "date" ? detectDateOrder(labels) : undefined;
    const keyed = points.map((point, i) => ({
      point,
      key:
        x.xColDef.type === "date"
          ? parseDateValue(labels[i]!, order)
          : parseNumericValue(labels[i]!),
    }));
    // Unreadable x values first, so the kept tail holds the latest valid points
    return keyed
      .sort((a, b) =>
        a.key === null || b.key === null
          ? (a.key === null ? 0 : 1) - (b.key === null ? 0 : 1)
          : a.key - b.key,
      )
      .slice(-limit)
      .map(({ point }) => point);
  }

  if (points.length <= limit) return points;
  const top = new Set(
    [...points].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, limit),
  );
  return points.filter((p) => top.has(p));
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
