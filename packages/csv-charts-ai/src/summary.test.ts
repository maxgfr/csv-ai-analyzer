import { describe, it, expect } from "vitest";
import { generateDataSummary } from "./ai";
import type { TabularData } from "./types";

const sales: TabularData = {
  headers: ["date", "product", "revenue"],
  rows: [
    ["2024-01-05", "Phone", "100"],
    ["2024-01-20", "Laptop", "300"],
    ["2024-02-03", "Phone", "250"],
    ["2024-02-10", "Mouse", "20"],
    ["2024-03-01", "Laptop", "60"],
  ],
  columns: [
    { name: "date", type: "date", index: 0 },
    { name: "product", type: "string", index: 1 },
    { name: "revenue", type: "number", index: 2 },
  ],
  rowCount: 5,
};

describe("group totals in the data summary", () => {
  it("gives exact totals per category, largest first", () => {
    const summary = generateDataSummary(sales);
    expect(summary).toContain("Group totals (exact, computed on all 5 rows)");
    expect(summary).toContain(
      "- revenue by product: Laptop=360 (2 rows); Phone=350 (2 rows); Mouse=20 (1 rows)",
    );
    expect(summary).toContain("sum=730");
  });

  it("gives totals per month and the date range", () => {
    const summary = generateDataSummary(sales);
    expect(summary).toContain(
      "- revenue by month of date: 2024-01=400 (2 rows); 2024-02=270 (2 rows); 2024-03=60 (1 rows)",
    );
    expect(summary).toContain("from 2024-01-05 to 2024-03-01");
  });

  it("skips identifiers and high-cardinality columns", () => {
    const ids: TabularData = {
      headers: ["id", "value"],
      rows: Array.from({ length: 80 }, (_, i) => [`id-${i}`, String(i)]),
      columns: [
        { name: "id", type: "string", index: 0 },
        { name: "value", type: "number", index: 1 },
      ],
      rowCount: 80,
    };
    expect(generateDataSummary(ids)).not.toContain("Group totals");
  });
});
