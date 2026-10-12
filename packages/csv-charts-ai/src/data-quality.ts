import type { TabularData } from "./types";
import {
  BOOLEAN_VALUES,
  detectDateOrder,
  isDateValue,
  parseNumericValue,
} from "./values";

export interface DataQualityResult {
  rowCount: number;
  /** Repeated occurrences beyond the first identical row. */
  duplicateRows: number;
  columns: { name: string; missing: number; invalid: number }[];
}

/** Local, deterministic diagnostics. Input is never modified. */
export function analyzeDataQuality(data: TabularData): DataQualityResult {
  const columns = data.columns.map((c) => ({
    name: c.name,
    missing: 0,
    invalid: 0,
  }));
  const dateOrders = data.columns.map((c) =>
    c.type === "date"
      ? detectDateOrder(data.rows.map((row) => row[c.index] ?? ""))
      : undefined,
  );
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const row of data.rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
    for (const [i, col] of data.columns.entries()) {
      const value = (row[col.index] ?? "").trim();
      const stat = columns[i]!;
      if (!value) {
        stat.missing++;
        continue;
      }
      if (
        (col.type === "number" && parseNumericValue(value) === null) ||
        (col.type === "date" && !isDateValue(value, dateOrders[i])) ||
        (col.type === "boolean" && !BOOLEAN_VALUES.has(value.toLowerCase()))
      )
        stat.invalid++;
    }
  }
  return { rowCount: data.rows.length, duplicateRows, columns };
}
