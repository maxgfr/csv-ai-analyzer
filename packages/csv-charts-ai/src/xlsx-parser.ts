import { inferValuesType, uniqueHeaders } from "./values";
import type { TabularData } from "./types";

export interface ParseXLSXOptions {
  /** Whether the first row is a header row (default: true). */
  hasHeader?: boolean;
  /** Sheet name or one-based index. Defaults to the first sheet. */
  sheet?: string | number;
  /** Keep cells beyond the header width using generated column names. */
  preserveExtraColumns?: boolean;
  /** Skip empty lines (default: true). */
  skipEmpty?: boolean;
}

// ============ Core conversion (universal, no dependencies) ============

/**
 * Convert raw XLSX rows (as returned by `read-excel-file`) into TabularData.
 *
 * This function is **universal** — it works in Node.js, browsers, and web workers.
 * You read the file yourself with `read-excel-file` (or any other XLSX parser)
 * and pass the resulting rows here.
 *
 * @example
 * ```ts
 * // Node.js
 * import readXlsxFile from "read-excel-file/node";
 * import { convertXLSXRows } from "csv-charts-ai";
 *
 * const rows = await readXlsxFile("data.xlsx");
 * const data = convertXLSXRows(rows);
 * ```
 *
 * @example
 * ```ts
 * // Browser
 * import readXlsxFile from "read-excel-file/browser";
 * import { convertXLSXRows } from "csv-charts-ai";
 *
 * const rows = await readXlsxFile(file);
 * const data = convertXLSXRows(rows);
 * ```
 */
export function convertXLSXRows(
  rawRows: (string | number | boolean | Date | null)[][],
  options: ParseXLSXOptions = {},
): TabularData {
  const { hasHeader = true, skipEmpty = true } = options;

  // Convert all cells to strings
  let rows = rawRows.map((row) =>
    row.map((cell) =>
      cell != null
        ? cell instanceof Date
          ? cell.toISOString()
          : String(cell)
        : "",
    ),
  );

  if (skipEmpty) {
    rows = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], columns: [], rowCount: 0 };
  }

  const firstRow = [...rows[0]!];
  if (options.preserveExtraColumns) {
    const width = rows.reduce(
      (max, row) => Math.max(max, row.length),
      firstRow.length,
    );
    while (firstRow.length < width) firstRow.push("");
  }
  const headers = hasHeader
    ? uniqueHeaders(firstRow)
    : firstRow.map((_, i) => `Column ${i + 1}`);

  const dataRows = hasHeader ? rows.slice(1) : rows;

  // Normalize: ensure every row has exactly `headers.length` cells
  const normalizedRows = dataRows.map((row) =>
    headers.map((_, i) => row[i] ?? ""),
  );

  const columns = headers.map((name, index) => ({
    name,
    type: inferValuesType(
      normalizedRows.slice(0, 100).map((row) => row[index] ?? ""),
    ),
    index,
  }));

  return {
    headers,
    rows: normalizedRows,
    columns,
    rowCount: normalizedRows.length,
  };
}

// ============ Browser convenience ============

/**
 * Parse an Excel (.xlsx) file into TabularData. **Browser only.**
 *
 * `read-excel-file` is bundled — no extra install needed.
 * Reads the first sheet unless `options.sheet` is specified.
 *
 * @example
 * ```tsx
 * import { parseXLSX } from "csv-charts-ai";
 *
 * const handleFile = async (file: File) => {
 *   const data = await parseXLSX(file);
 *   console.log(data.headers, data.rowCount);
 * };
 * ```
 */
export async function parseXLSX(
  file: File,
  options: ParseXLSXOptions = {},
): Promise<TabularData> {
  const mod = await loadReader();
  const result = await mod.default(file, { sheet: options.sheet ?? 1 });
  const rawRows = result as (string | number | boolean | Date | null)[][];
  return convertXLSXRows(rawRows, options);
}

/** List workbook sheets without selecting one. Browser and worker compatible. */
export async function listXLSXSheets(file: File): Promise<string[]> {
  const { readSheetNames } = await loadReader();
  return readSheetNames(file);
}

async function loadReader() {
  return typeof DOMParser === "undefined"
    ? import("read-excel-file/web-worker")
    : import("read-excel-file/browser");
}
