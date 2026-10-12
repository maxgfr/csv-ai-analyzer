/** Save a blob as a file. The URL is revoked later, once the browser has read it. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Signed numbers in any local format (-1,234.56, -1.234,56, -5%, 1e3) or a lone sign. */
const PLAIN_NUMBER =
  /^(?:[+-]|[+-]?[\d\s.,'\u00a0\u202f]*\d[\d\s.,'\u00a0\u202f]*(?:e[+-]?\d+)?\s*%?)$/i;

/**
 * Quote a CSV field. Text starting with = + - @ (or a tab/CR) is prefixed with
 * an apostrophe so spreadsheets do not run it as a formula; numbers such as
 * "-5" are left as they are.
 */
export function escapeCSVField(value: string): string {
  const safe =
    /^[=+\-@\t\r]/.test(value) && !PLAIN_NUMBER.test(value.trim())
      ? `'${value}`
      : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV text for a header row and data rows, safe to open in a spreadsheet. */
export function toCSV(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((row) => row.map((v) => escapeCSVField(String(v ?? ""))).join(","))
    .join("\n");
}
