import { parseNumericValue, parseDateValue } from "csv-charts-ai";
import type { CSVData } from "./csv-parser";

export interface ColumnFilter {
  column: string;
  operator: "eq" | "neq" | "gt" | "lt" | "contains" | "empty" | "not_empty";
  value: string;
}
export interface SortConfig {
  column: string;
  direction: "asc" | "desc";
}
export interface TransformOptions {
  filters: ColumnFilter[];
  excludedColumns: string[];
  sort: SortConfig | null;
}

export function compareCells(a: string, b: string, type: string): number {
  if (!a.trim() || !b.trim())
    return !a.trim() === !b.trim() ? 0 : !a.trim() ? 1 : -1;
  if (type === "number") {
    const x = parseNumericValue(a),
      y = parseNumericValue(b);
    if (x !== null && y !== null) return x - y;
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  }
  if (type === "date") {
    const x = parseDateValue(a),
      y = parseDateValue(b);
    if (x !== null && y !== null) return x - y;
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  }
  return a.localeCompare(b);
}

export function transformData(
  data: CSVData,
  options: TransformOptions,
): CSVData {
  const filters = options.filters
    .filter(
      (f) => f.value || f.operator === "empty" || f.operator === "not_empty",
    )
    .map((f) => ({
      ...f,
      index: data.headers.indexOf(f.column),
      target: f.value.toLowerCase(),
    }))
    .filter((f) => f.index >= 0);
  const excluded = new Set(options.excludedColumns);
  if (!filters.length && !excluded.size && !options.sort) return data;
  let rows = filters.length
    ? data.rows.filter((row) =>
        filters.every((f) => {
          const value = (row[f.index] ?? "").toLowerCase();
          switch (f.operator) {
            case "eq":
              return value === f.target;
            case "neq":
              return value !== f.target;
            case "contains":
              return value.includes(f.target);
            case "empty":
              return !value.trim();
            case "not_empty":
              return !!value.trim();
            case "gt":
            case "lt": {
              const a = parseNumericValue(value),
                b = parseNumericValue(f.target);
              return (
                a !== null &&
                b !== null &&
                (f.operator === "gt" ? a > b : a < b)
              );
            }
          }
        }),
      )
    : data.rows;
  if (options.sort) {
    const column = data.columns.find((c) => c.name === options.sort!.column);
    if (column)
      rows = [...rows].sort(
        (a, b) =>
          compareCells(
            a[column.index] ?? "",
            b[column.index] ?? "",
            column.type,
          ) * (options.sort!.direction === "desc" ? -1 : 1),
      );
  }
  const columns = data.columns.filter((c) => !excluded.has(c.name));
  if (excluded.size)
    rows = rows.map((row) => columns.map((c) => row[c.index] ?? ""));
  return {
    headers: columns.map((c) => c.name),
    columns: columns.map((c, index) => ({ ...c, index })),
    rows,
    rowCount: rows.length,
  };
}

export function tableRows(
  data: CSVData,
  query: string,
  sort: SortConfig | null,
): string[][] {
  const needle = query.trim().toLowerCase();
  const rows = needle
    ? data.rows.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(needle)),
      )
    : data.rows;
  if (!sort) return rows;
  const col = data.columns.find((c) => c.name === sort.column);
  return col
    ? [...rows].sort(
        (a, b) =>
          compareCells(a[col.index] ?? "", b[col.index] ?? "", col.type) *
          (sort.direction === "desc" ? -1 : 1),
      )
    : rows;
}
