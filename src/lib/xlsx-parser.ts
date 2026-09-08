import type { CSVData } from "./csv-parser";
/**
 * Check whether a file name indicates an Excel spreadsheet (.xlsx).
 */
export function isXLSXFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".xlsx");
}

/** Supported spreadsheet extensions for accept attributes and validation. */
export const SPREADSHEET_ACCEPT = ".csv,.xlsx";

/** Check if a file is a supported format (CSV or XLSX). */
export function isSupportedFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".csv") || lower.endsWith(".xlsx");
}

export async function parseXLSX(
  file: File,
  options: {
    hasHeader?: boolean;
    skipEmptyLines?: boolean;
    sheet?: string | number;
  } = {},
): Promise<CSVData> {
  const { parseXLSX: parse } = await import("csv-charts-ai");
  return parse(file, {
    hasHeader: options.hasHeader,
    skipEmpty: options.skipEmptyLines,
    sheet: options.sheet,
    preserveExtraColumns: true,
  });
}
