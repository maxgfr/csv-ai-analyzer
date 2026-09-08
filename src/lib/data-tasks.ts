import { compareDataSets, type ComparisonResult } from "./comparison";
import {
  analyzeDataQuality,
  listXLSXSheets,
  type DataQualityResult,
  type DiffOptions,
} from "csv-charts-ai";
import {
  parseCSVWithDiagnostics,
  type CSVData,
  type CSVSettings,
} from "./csv-parser";
import { isXLSXFile, parseXLSX } from "./xlsx-parser";
import {
  transformData,
  tableRows,
  type SortConfig,
  type TransformOptions,
} from "./data-operations";

export interface ImportSource {
  file: File;
  settings: CSVSettings;
  sheet?: string;
}
export interface ImportResult {
  data: CSVData;
  sheets: string[];
  warnings: string[];
}
export interface TaskInputs {
  import: ImportSource;
  quality: CSVData;
  transform: { data: CSVData; options: TransformOptions };
  table: { data: CSVData; query: string; sort: SortConfig | null };
  diff: { a: CSVData; b: CSVData; options: DiffOptions };
}
export interface TaskOutputs {
  import: ImportResult;
  quality: DataQualityResult;
  transform: CSVData;
  table: string[][];
  diff: ComparisonResult;
}

export async function executeDataTask<K extends keyof TaskInputs>(
  kind: K,
  input: TaskInputs[K],
): Promise<TaskOutputs[K]> {
  let result: unknown;
  switch (kind) {
    case "import": {
      const { file, settings, sheet } = input as ImportSource;
      const sheets = isXLSXFile(file.name) ? await listXLSXSheets(file) : [];
      const text = sheets.length
        ? ""
        : new TextDecoder(settings.encoding).decode(await file.arrayBuffer());
      const parsed = sheets.length
        ? {
            data: await parseXLSX(file, { ...settings, sheet }),
            warnings: [] as string[],
          }
        : parseCSVWithDiagnostics(text, settings);
      const { data, warnings } = parsed;
      if (text.includes("\uFFFD"))
        warnings.push(
          "Some characters could not be decoded. Try another encoding.",
        );
      if (data.rows.length === 0)
        warnings.push(
          "This file has no data rows. Check the header and sheet settings.",
        );
      result = { data, sheets, warnings };
      break;
    }
    case "quality":
      result = analyzeDataQuality(input as CSVData);
      break;
    case "transform": {
      const { data, options } = input as TaskInputs["transform"];
      result = transformData(data, options);
      break;
    }
    case "table": {
      const { data, query, sort } = input as TaskInputs["table"];
      result = tableRows(data, query, sort);
      break;
    }
    case "diff": {
      const { a, b, options } = input as TaskInputs["diff"];
      result = compareDataSets(a, b, options);
      break;
    }
  }
  return result as TaskOutputs[K];
}
