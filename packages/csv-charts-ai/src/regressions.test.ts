import { describe, it, expect } from "vitest";
import { computeDiff } from "./csv-diff";
import { processChartData } from "./processChartData";
import type { TabularData, ChartConfig } from "./types";
import {
  detectDateOrder,
  inferValuesType,
  parseDateValue,
  parseNumericValue,
} from "./values";
const data = (rows: string[][]): TabularData => ({
  headers: ["id", "value"],
  columns: [
    { name: "id", index: 0, type: "string" },
    { name: "value", index: 1, type: "number" },
  ],
  rows,
  rowCount: rows.length,
});
const chart: ChartConfig = {
  id: "test",
  title: "Test",
  description: "",
  type: "bar",
  xAxis: "id",
  yAxis: "value",
  aggregation: "none",
};
describe("data integrity regressions", () => {
  it("sorts all rows before limiting chart points", () => {
    expect(
      processChartData(
        data([
          ["a", "2"],
          ["b", "3"],
          ["c", "99"],
        ]),
        chart,
        "desc",
        1,
      )[0]?.value,
    ).toBe(99);
  });
  it("continues past invalid values to fill the chart", () => {
    expect(
      processChartData(
        data([
          ["a", ""],
          ["b", "bad"],
          ["c", "9"],
        ]),
        chart,
        "none",
        1,
      )[0]?.value,
    ).toBe(9);
  });
  it("does not overwrite the X axis when counting its occurrences", () => {
    const points = processChartData(
      data([
        ["a", "2"],
        ["a", "3"],
      ]),
      { ...chart, yAxis: "id", aggregation: "count" },
    );
    expect(points[0]?.id).toBe("a");
    expect(Object.values(points[0]!)).toContain(2);
  });
  it("preserves every duplicate key occurrence in order", () => {
    const a = data([
      ["x", "1"],
      ["x", "2"],
      ["x", "3"],
    ]);
    const b = data([
      ["x", "1"],
      ["x", "4"],
    ]);
    const diff = computeDiff(a, b, { matchMode: "key", keyColumn: "id" });
    expect(diff.counts).toEqual({ same: 1, changed: 1, removed: 1, added: 0 });
    expect(diff.rows.map((r) => r.indexA)).toEqual([0, 1, 2]);
  });
  it("cannot confuse embedded separators with column boundaries", () => {
    const diff = computeDiff(data([["a\0b", "c"]]), data([["a", "b\0c"]]), {
      matchMode: "content",
    });
    expect(diff.counts.same).toBe(0);
  });
});

describe("number and date parsing", () => {
  it("reads a leading zero group as a decimal comma", () => {
    expect(parseNumericValue("0,123")).toBe(0.123);
    expect(parseNumericValue("1,234")).toBe(1234);
    expect(parseNumericValue("12,345,678.5")).toBe(12345678.5);
  });

  it("accepts ISO datetimes with a space and single-digit parts", () => {
    expect(parseDateValue("2024-01-15 10:30:00")).toBe(
      Date.UTC(2024, 0, 15, 10, 30, 0),
    );
    expect(parseDateValue("2024-1-5")).toBe(Date.UTC(2024, 0, 5));
    expect(parseDateValue("5/1/2024")).toBe(Date.UTC(2024, 0, 5));
  });

  it("reads datetimes without an offset as UTC and honours offsets", () => {
    expect(parseDateValue("2024-01-15T10:30:00")).toBe(
      Date.UTC(2024, 0, 15, 10, 30),
    );
    expect(parseDateValue("2024-01-15T10:30:00+02:00")).toBe(
      Date.UTC(2024, 0, 15, 8, 30),
    );
    expect(parseDateValue("2024-01-15T10:30:00.250Z")).toBe(
      Date.UTC(2024, 0, 15, 10, 30, 0, 250),
    );
    expect(parseDateValue("2024-02-30")).toBeNull();
  });

  it("chooses one day/month order per column", () => {
    const us = ["03/04/2024", "04/25/2024", "12/31/2024"];
    const eu = ["03/04/2024", "25/04/2024"];
    expect(detectDateOrder(us)).toBe("mdy");
    expect(detectDateOrder(eu)).toBe("dmy");
    expect(parseDateValue("03/04/2024", detectDateOrder(us))).toBe(
      Date.UTC(2024, 2, 4),
    );
    expect(parseDateValue("03/04/2024", detectDateOrder(eu))).toBe(
      Date.UTC(2024, 3, 3),
    );
  });

  it("infers the type from values spread over the whole column", () => {
    const values = [
      ...Array<string>(500).fill("n/a"),
      ...Array.from({ length: 4500 }, (_, i) => String(i)),
    ];
    expect(inferValuesType(values)).toBe("number");
    const strings = [
      ...Array.from({ length: 200 }, (_, i) => String(i)),
      ...Array<string>(4800).fill("label"),
    ];
    expect(inferValuesType(strings)).toBe("string");
  });
});
