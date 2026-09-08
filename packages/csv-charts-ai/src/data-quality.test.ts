import { it, expect } from "vitest";
import { analyzeDataQuality } from "./data-quality";
import { parseCSV } from "./csv-parser";
import { convertXLSXRows } from "./xlsx-parser";
import { parseNumericValue, isDateValue } from "./values";
it("counts missing, invalid and duplicate rows without mutating input", () => {
  const data = parseCSV("id,amount\na,10\na,10\nb,\nc,bad\nd,20\ne,30");
  data.columns[1]!.type = "number";
  const before = structuredClone(data);
  const quality = analyzeDataQuality(data);
  expect(quality.duplicateRows).toBe(1);
  expect(quality.columns[1]).toEqual({
    name: "amount",
    missing: 1,
    invalid: 1,
  });
  expect(data).toEqual(before);
});
it.each([
  ["1,234.50", 1234.5],
  ["1 234,50", 1234.5],
  ["12,5", 12.5],
  ["1e3", 1000],
  ["", null],
  ["5oops", null],
  ["Infinity", null],
])("parses %s consistently", (text, value) =>
  expect(parseNumericValue(String(text))).toBe(value),
);
it("validates dates and leap years", () => {
  expect(isDateValue("2024-02-29")).toBe(true);
  expect(isDateValue("2025-02-29")).toBe(false);
  expect(isDateValue("31/02/2024")).toBe(false);
});
it("serializes Excel dates consistently and preserves requested extra cells", () => {
  const data = convertXLSXRows(
    [["date"], [new Date("2024-05-01T00:00:00Z"), "extra"]],
    { preserveExtraColumns: true },
  );
  expect(data.rows[0]).toEqual(["2024-05-01T00:00:00.000Z", "extra"]);
  expect(data.columns[0]?.type).toBe("date");
});
it("reads the first Excel sheet by default and selects another explicitly", async () => {
  const { readFile } = await import("node:fs/promises");
  const { parseXLSX, listXLSXSheets } = await import("./xlsx-parser");
  const buffer = await readFile(
    new URL("../../../e2e/fixtures/sheets.xlsx", import.meta.url),
  );
  const file = new File([buffer], "sheets.xlsx");
  expect(await listXLSXSheets(file)).toEqual(["First", "Second"]);
  expect((await parseXLSX(file)).rows[0]?.[0]).toBe("first sheet value");
  expect((await parseXLSX(file, { sheet: "Second" })).rows[0]?.[0]).toBe(
    "second sheet value",
  );
});
