import { describe, it, expect } from "vitest";
import { parseCSV } from "./csv-parser";
import { transformData, tableRows } from "./data-operations";
import { executeDataTask } from "./data-tasks";
import { compareDataSets } from "./comparison";

describe("data operations", () => {
  it("uses quoted delimiter detection and preserves extra cells", () => {
    const data = parseCSV('name;description\nAlice;"a,b,c,d,e"\nBob;ok;extra');
    expect(data.headers).toEqual(["name", "description", "Column 3"]);
    expect(data.rows[1]).toEqual(["Bob", "ok", "extra"]);
  });
  it("makes repeated headers distinct", () => {
    expect(new Set(parseCSV("id,id,id (2)\na,b,c").headers).size).toBe(3);
  });
  it("rejects unclosed fields", () => {
    expect(() => parseCSV('a,b\n"unclosed,2')).toThrow();
  });
  it("decodes Windows-1252 at the real import boundary", async () => {
    const file = new File(
      [new Uint8Array([110, 97, 109, 101, 10, 99, 97, 102, 233])],
      "latin.csv",
    );
    const result = await executeDataTask("import", {
      file,
      settings: {
        delimiter: "",
        hasHeader: true,
        skipEmptyLines: true,
        encoding: "Windows-1252",
      },
    });
    expect(result.data.rows[0]?.[0]).toBe("café");
  });
  it("filters grouped numbers, preserves input and removes columns consistently", () => {
    const data = parseCSV("name;amount;extra\nA;1 234,50;x\nB;20;y\nC;;z");
    const before = structuredClone(data);
    const transformed = transformData(data, {
      filters: [{ column: "amount", operator: "gt", value: "100" }],
      excludedColumns: ["extra"],
      sort: null,
    });
    expect(transformed.rows).toEqual([["A", "1 234,50"]]);
    expect(transformed.columns.map((c) => c.index)).toEqual([0, 1]);
    expect(data).toEqual(before);
  });
  it("searches every row before pagination without changing source data", () => {
    const data = parseCSV("name,value\nAlice,20\nBOB,2");
    expect(tableRows(data, "bob", null)).toEqual([["BOB", "2"]]);
    expect(data.rowCount).toBe(2);
    expect(
      tableRows(data, "", { column: "value", direction: "asc" })[0]?.[0],
    ).toBe("BOB");
  });
  it("computes large comparison statistics without spreading arrays on the stack", () => {
    const rows = Array.from({ length: 150000 }, (_, i) => [String(i)]);
    const data = {
      headers: ["n"],
      rows,
      rowCount: rows.length,
      columns: [{ name: "n", index: 0, type: "number" as const }],
    };
    expect(
      compareDataSets(data, data, { matchMode: "index" }).stats[0]?.primary.max,
    ).toBe(149999);
  });
});

it("does not flag legitimate suffixed headers as renamed", async () => {
  const file = new File(["amount (2)\n42"], "data.csv");
  const result = await executeDataTask("import", {
    file,
    settings: {
      delimiter: "",
      hasHeader: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
    },
  });
  expect(result.warnings).toEqual([]);
});
