import { inferValuesType, uniqueHeaders } from "./values";
import type { TabularData } from "./types";

export interface ParseCSVOptions {
  /** Column delimiter. Auto-detected if omitted (supports , ; \t |). */
  delimiter?: string;
  /** Whether the first row is a header row (default: true). */
  hasHeader?: boolean;
  /** Skip empty lines (default: true). */
  skipEmpty?: boolean;
}

/**
 * Parse a CSV string into TabularData with automatic delimiter detection
 * and column type inference.
 *
 * Handles quoted fields (RFC 4180), escaped quotes, and mixed line endings.
 *
 * @example
 * ```ts
 * import { parseCSV } from "csv-charts-ai";
 *
 * const data = parseCSV(`name,age,city
 * Alice,30,"New York"
 * Bob,25,Paris`);
 *
 * console.log(data.headers);   // ["name", "age", "city"]
 * console.log(data.rowCount);  // 2
 * console.log(data.columns);   // [{ name: "name", type: "string", ... }, ...]
 * ```
 *
 * @example
 * ```ts
 * // Auto-detects semicolon delimiter
 * const data = parseCSV("nom;age;ville\nAlice;30;Paris");
 *
 * // Explicit delimiter
 * const data = parseCSV(tsv, { delimiter: "\t" });
 *
 * // No header row
 * const data = parseCSV(raw, { hasHeader: false });
 * ```
 *
 * For very complex CSV files (multi-line quoted fields with nested newlines,
 * exotic encodings), consider using PapaParse and passing the result as
 * TabularData directly to the AI functions.
 */
export function parseCSV(
  csv: string,
  options: ParseCSVOptions = {},
): TabularData {
  const { hasHeader = true, skipEmpty = true } = options;

  // Normalize line endings and strip BOM
  const normalized = csv
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  if (normalized.trim().length === 0) {
    return { headers: [], rows: [], columns: [], rowCount: 0 };
  }

  const delimiter = options.delimiter ?? detectCSVDelimiter(normalized);
  const allRows = parseRows(normalized, delimiter, skipEmpty);

  if (allRows.length === 0) {
    return { headers: [], rows: [], columns: [], rowCount: 0 };
  }

  // Normalize row lengths to match the first row
  const expectedCols = allRows[0]!.length;
  const normalizedRows = allRows.map((row) => {
    if (row.length < expectedCols) {
      return [...row, ...Array<string>(expectedCols - row.length).fill("")];
    }
    return row.slice(0, expectedCols);
  });

  const headers = hasHeader
    ? uniqueHeaders(normalizedRows[0]!)
    : normalizedRows[0]!.map((_, i) => `Column ${i + 1}`);
  const dataRows = hasHeader ? normalizedRows.slice(1) : normalizedRows;

  const columns = headers.map((name, index) => ({
    name: name.trim(),
    type: inferColumnType(dataRows, index),
    index,
  }));

  return {
    headers: headers.map((h) => h.trim()),
    rows: dataRows,
    columns,
    rowCount: dataRows.length,
  };
}

// ============ Delimiter Detection ============

export function detectCSVDelimiter(csv: string): string {
  const firstLines: string[] = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < csv.length && firstLines.length < 5; i++) {
    if (csv[i] === '"') quoted = !quoted;
    if (csv[i] === "\n" && !quoted) {
      firstLines.push(csv.slice(start, i));
      start = i + 1;
    }
  }
  if (firstLines.length < 5 && start < csv.length)
    firstLines.push(csv.slice(start));
  const candidates: Record<string, number[]> = {
    ",": [],
    ";": [],
    "\t": [],
    "|": [],
  };

  for (const line of firstLines) {
    let inQuotes = false;
    const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && char in counts) {
        counts[char]!++;
      }
    }
    for (const [delim, count] of Object.entries(counts)) {
      candidates[delim]!.push(count);
    }
  }

  // Best delimiter: consistent count across lines AND highest count
  let best = ",";
  let bestScore = -1;

  for (const [delim, counts] of Object.entries(candidates)) {
    if (counts.length === 0 || counts[0] === 0) continue;

    const allSame = counts.every((c) => c === counts[0]);
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    // Prefer consistency, then count
    const score = (allSame ? 1000 : 0) + avgCount;

    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }

  return best;
}

// ============ Row Parsing (RFC 4180) ============

function parseRows(
  csv: string,
  delimiter: string,
  skipEmpty: boolean,
): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        current.push(field);
        field = "";
      } else if (char === "\n") {
        current.push(field);
        if (!skipEmpty || current.some((c) => c.trim() !== "")) {
          rows.push(current);
        }
        current = [];
        field = "";
      } else {
        field += char;
      }
    }
  }

  if (inQuotes)
    throw new Error(
      "Unclosed quoted field. Check the CSV delimiter and quotes.",
    );

  // Last field/row
  current.push(field);
  if (
    (!skipEmpty &&
      (field !== "" || current.length > 1 || !csv.endsWith("\n"))) ||
    current.some((c) => c.trim() !== "")
  ) {
    rows.push(current);
  }

  return rows;
}

function inferColumnType(rows: string[][], colIndex: number) {
  return inferValuesType(rows.slice(0, 100).map((row) => row[colIndex] ?? ""));
}
