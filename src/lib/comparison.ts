import {
  computeDiff,
  parseNumericValue,
  type DiffOptions,
  type DiffResult as BaseDiffResult,
} from "csv-charts-ai";
import type { CSVData } from "./csv-parser";
export interface ColumnStat {
  column: string;
  type: "numeric" | "categorical";
  primary: {
    count?: number;
    avg?: number;
    min?: number;
    max?: number;
    distinct?: number;
  };
  compare: {
    count?: number;
    avg?: number;
    min?: number;
    max?: number;
    distinct?: number;
  };
}

export interface ComparisonResult extends BaseDiffResult {
  stats: ColumnStat[];
}

export function compareDataSets(
  primaryData: CSVData,
  compareData: CSVData,
  options: DiffOptions,
): ComparisonResult {
  const baseDiff = computeDiff(primaryData, compareData, options);
  // Column-level stats
  const { commonHeaders } = baseDiff;
  const stats: ColumnStat[] = commonHeaders.map((header) => {
    const pIdx = primaryData.headers.indexOf(header);
    const cIdx = compareData.headers.indexOf(header);
    const pCol = primaryData.columns.find((c) => c.name === header);

    if (pCol?.type !== "number") {
      const pDistinct = new Set(primaryData.rows.map((r) => r[pIdx])).size;
      const cDistinct = new Set(compareData.rows.map((r) => r[cIdx])).size;
      return {
        column: header,
        type: "categorical" as const,
        primary: { distinct: pDistinct },
        compare: { distinct: cDistinct },
      };
    }

    const pValues = primaryData.rows
      .map((r) => parseNumericValue(String(r[pIdx] ?? "")))
      .filter((v): v is number => v !== null);
    const cValues = compareData.rows
      .map((r) => parseNumericValue(String(r[cIdx] ?? "")))
      .filter((v): v is number => v !== null);

    if (pValues.length === 0 && cValues.length === 0) {
      return {
        column: header,
        type: "categorical" as const,
        primary: { distinct: 0 },
        compare: { distinct: 0 },
      };
    }

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const min = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => Math.min(a, b), Infinity) : 0;
    const max = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => Math.max(a, b), -Infinity) : 0;

    return {
      column: header,
      type: "numeric" as const,
      primary: {
        count: pValues.length,
        avg: avg(pValues),
        min: min(pValues),
        max: max(pValues),
      },
      compare: {
        count: cValues.length,
        avg: avg(cValues),
        min: min(cValues),
        max: max(cValues),
      },
    };
  });

  return { ...baseDiff, stats };
}
