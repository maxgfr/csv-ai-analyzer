import Papa, { type ParseResult } from "papaparse";
import {
  inferValuesType,
  detectCSVDelimiter,
  uniqueHeaders,
  generateDataSummary as pkgGenerateDataSummary,
} from "csv-charts-ai";

export interface CSVColumn {
  name: string;
  type: "string" | "number" | "date" | "boolean";
  index: number;
}

export interface CSVData {
  headers: string[];
  rows: string[][];
  columns: CSVColumn[];
  rowCount: number;
}

export interface CSVSettings {
  delimiter: string;
  hasHeader: boolean;
  encoding: string;
  skipEmptyLines: boolean;
}

export const DEFAULT_CSV_SETTINGS: CSVSettings = {
  delimiter: "",
  hasHeader: true,
  encoding: "UTF-8",
  skipEmptyLines: true,
};

export const inferColumnType = inferValuesType;

export const parseCSVWithDiagnostics = (
  content: string,
  settings: CSVSettings = DEFAULT_CSV_SETTINGS,
): { data: CSVData; warnings: string[] } => {
  const delimiter = settings.delimiter || detectCSVDelimiter(content);

  const result: ParseResult<string[]> = Papa.parse<string[]>(content, {
    delimiter,
    skipEmptyLines: settings.skipEmptyLines ? "greedy" : false,
  });

  const fatal = result.errors.find((error) => error.type === "Quotes");
  if (fatal) throw new Error(fatal.message);
  const allRows: string[][] = content.trim() ? result.data : [];

  if (allRows.length === 0) {
    return {
      data: { headers: [], rows: [], columns: [], rowCount: 0 },
      warnings: [],
    };
  }

  const firstRow = [...(allRows[0] ?? [])];
  const width = allRows.reduce(
    (max, row) => Math.max(max, row.length),
    firstRow.length,
  );
  while (firstRow.length < width) firstRow.push("");
  const headers: string[] = settings.hasHeader
    ? uniqueHeaders(firstRow)
    : firstRow.map((_: string, i: number) => `Column ${i + 1}`);

  const rawDataRows = settings.hasHeader ? allRows.slice(1) : allRows;
  const warnings: string[] = [];
  if (
    settings.hasHeader &&
    headers.some((h, i) => h !== (firstRow[i] ?? "").trim())
  )
    warnings.push(
      "Repeated or empty headers were renamed to keep columns distinct.",
    );
  const irregular = rawDataRows.filter(
    (row) => row.length !== (allRows[0]?.length ?? 0),
  ).length;
  if (irregular)
    warnings.push(
      `${irregular} rows have a different width from the first row. Missing cells were filled; extra columns were preserved.`,
    );
  const dataRows = rawDataRows.map((row) =>
    headers.map((_, i) => row[i] ?? ""),
  );

  const columns: CSVColumn[] = headers.map((name, index) => {
    const columnValues = dataRows.slice(0, 100).map((row) => row[index] ?? "");
    return {
      name,
      type: inferColumnType(columnValues),
      index,
    };
  });

  return {
    data: { headers, rows: dataRows, columns, rowCount: dataRows.length },
    warnings,
  };
};

export const parseCSV = (
  content: string,
  settings: CSVSettings = DEFAULT_CSV_SETTINGS,
): CSVData => parseCSVWithDiagnostics(content, settings).data;

/**
 * Generate a detailed human-readable summary of CSV data.
 * Delegates to the csv-charts-ai package (CSVData is structurally identical to TabularData).
 */
const summaries = new WeakMap<CSVData, string>();
export const generateDataSummary = (data: CSVData): string => {
  let summary = summaries.get(data);
  if (summary === undefined) {
    summary = pkgGenerateDataSummary(data);
    summaries.set(data, summary);
  }
  return summary;
};
