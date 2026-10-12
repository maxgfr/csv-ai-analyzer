import {
  parseNumericValue,
  parseDateValue,
  detectDateOrder,
  type DateOrder,
} from "csv-charts-ai";
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

export function compareCells(
  a: string,
  b: string,
  type: string,
  dateOrder?: DateOrder,
): number {
  if (!a.trim() || !b.trim())
    return !a.trim() === !b.trim() ? 0 : !a.trim() ? 1 : -1;
  if (type === "number") {
    const x = parseNumericValue(a),
      y = parseNumericValue(b);
    if (x !== null && y !== null) return x - y;
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  }
  if (type === "date") {
    const x = parseDateValue(a, dateOrder),
      y = parseDateValue(b, dateOrder);
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
  if (options.sort) rows = sortRows(rows, data.columns, options.sort);
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

/** Rows of the table preview: search over every cell, then sort. */
export function tableRows(
  data: CSVData,
  query: string,
  sort: SortConfig | null,
): string[][] {
  if (!query.trim() && !sort) return data.rows;
  return tableRowIndices(data, query, sort).map((i) => data.rows[i]!);
}

/** Same as {@link tableRows}, as indices into `data.rows` (cheap to send from a worker). */
export function tableRowIndices(
  data: CSVData,
  query: string,
  sort: SortConfig | null,
): number[] {
  const needle = query.trim().toLowerCase();
  const indices: number[] = [];
  for (let i = 0; i < data.rows.length; i++) {
    if (
      !needle ||
      data.rows[i]!.some((cell) => cell.toLowerCase().includes(needle))
    )
      indices.push(i);
  }
  if (!sort) return indices;
  const compare = rowComparator(
    data.columns,
    sort,
    indices.map((i) => data.rows[i]!),
  );
  return compare
    ? indices.sort((a, b) => compare(data.rows[a]!, data.rows[b]!))
    : indices;
}

function sortRows(
  rows: string[][],
  columns: CSVData["columns"],
  sort: SortConfig,
): string[][] {
  const compare = rowComparator(columns, sort, rows);
  return compare ? [...rows].sort(compare) : rows;
}

/** Empty cells stay at the end whatever the direction; the rest follow the column type. */
function rowComparator(
  columns: CSVData["columns"],
  sort: SortConfig,
  rows: string[][],
): ((a: string[], b: string[]) => number) | null {
  const col = columns.find((c) => c.name === sort.column);
  if (!col) return null;
  const order =
    col.type === "date"
      ? detectDateOrder(rows.map((row) => row[col.index] ?? ""))
      : undefined;
  const sign = sort.direction === "desc" ? -1 : 1;
  return (a, b) => {
    const x = a[col.index] ?? "",
      y = b[col.index] ?? "";
    const emptyX = !x.trim(),
      emptyY = !y.trim();
    if (emptyX || emptyY) return emptyX === emptyY ? 0 : emptyX ? 1 : -1;
    return compareCells(x, y, col.type, order) * sign;
  };
}
