import { describe, it, expect } from "vitest";
import { computeDiff } from "./csv-diff";
import { processChartData } from "./processChartData";
import type { TabularData, ChartConfig } from "./types";
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
