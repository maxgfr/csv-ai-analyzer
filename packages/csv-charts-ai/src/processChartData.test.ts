import { describe, it, expect } from "vitest";
import {
  OTHER_LABEL,
  SCATTER_POINT_LIMIT,
  processChartData,
  processChartDataMultiSeries,
} from "./processChartData";
import type { TabularData, ChartConfig } from "./types";

const sampleData: TabularData = {
  headers: ["category", "value", "region"],
  rows: [
    ["Electronics", "100", "North"],
    ["Electronics", "200", "South"],
    ["Clothing", "150", "North"],
    ["Clothing", "50", "South"],
    ["Food", "300", "North"],
    ["Food", "100", "South"],
  ],
  columns: [
    { name: "category", type: "string", index: 0 },
    { name: "value", type: "number", index: 1 },
    { name: "region", type: "string", index: 2 },
  ],
  rowCount: 6,
};

function makeChart(overrides: Partial<ChartConfig> = {}): ChartConfig {
  return {
    id: "test-1",
    type: "bar",
    title: "Test",
    description: "",
    xAxis: "category",
    yAxis: "value",
    aggregation: "sum",
    ...overrides,
  };
}

describe("processChartData", () => {
  describe("aggregation modes", () => {
    it("sum aggregation", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "sum" }),
      );
      const electronics = result.find((d) => d["category"] === "Electronics");
      expect(electronics?.["value"]).toBe(300); // 100 + 200
      const clothing = result.find((d) => d["category"] === "Clothing");
      expect(clothing?.["value"]).toBe(200); // 150 + 50
    });

    it("avg aggregation", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "avg" }),
      );
      const electronics = result.find((d) => d["category"] === "Electronics");
      expect(electronics?.["value"]).toBe(150); // (100+200)/2
    });

    it("count aggregation", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "count" }),
      );
      const electronics = result.find((d) => d["category"] === "Electronics");
      expect(electronics?.["value"]).toBe(2);
      const food = result.find((d) => d["category"] === "Food");
      expect(food?.["value"]).toBe(2);
    });

    it("min aggregation", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "min" }),
      );
      const electronics = result.find((d) => d["category"] === "Electronics");
      expect(electronics?.["value"]).toBe(100);
    });

    it("max aggregation", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "max" }),
      );
      const food = result.find((d) => d["category"] === "Food");
      expect(food?.["value"]).toBe(300);
    });

    it("no aggregation returns raw rows", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "none" }),
        "none",
        100,
      );
      expect(result.length).toBe(6);
    });
  });

  describe("count without Y column", () => {
    it("counts occurrences even without a valid yAxis", () => {
      const chart = makeChart({
        aggregation: "count",
        yAxis: "nonexistent",
      });
      const result = processChartData(sampleData, chart);
      const electronics = result.find((d) => d["category"] === "Electronics");
      expect(electronics?.["count"]).toBe(2);
    });
  });

  describe("sorting", () => {
    it("sorts descending by value", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "sum" }),
        "desc",
      );
      const values = result.map((d) => d["value"] as number);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]! <= values[i - 1]!).toBe(true);
      }
    });

    it("sorts ascending by value", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "sum" }),
        "asc",
      );
      const values = result.map((d) => d["value"] as number);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]! >= values[i - 1]!).toBe(true);
      }
    });
  });

  describe("limiting", () => {
    it("limits results to specified count", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "sum" }),
        "none",
        2,
      );
      expect(result.length).toBe(2);
    });

    it("returns all if limit exceeds data", () => {
      const result = processChartData(
        sampleData,
        makeChart({ aggregation: "sum" }),
        "none",
        100,
      );
      expect(result.length).toBe(3); // 3 categories
    });
  });

  describe("edge cases", () => {
    it("returns empty array for missing X column", () => {
      const chart = makeChart({ xAxis: "nonexistent" });
      const result = processChartData(sampleData, chart);
      expect(result).toEqual([]);
    });

    it("returns empty array for empty dataset", () => {
      const emptyData: TabularData = {
        headers: ["a", "b"],
        rows: [],
        columns: [
          { name: "a", type: "string", index: 0 },
          { name: "b", type: "number", index: 1 },
        ],
        rowCount: 0,
      };
      const result = processChartData(
        emptyData,
        makeChart({ xAxis: "a", yAxis: "b" }),
      );
      expect(result).toEqual([]);
    });

    it("handles case-insensitive column matching", () => {
      const chart = makeChart({
        xAxis: "CATEGORY",
        yAxis: "VALUE",
        aggregation: "sum",
      });
      const result = processChartData(sampleData, chart);
      expect(result.length).toBeGreaterThan(0);
    });

    it("rounds values to 6 significant digits", () => {
      const data: TabularData = {
        headers: ["cat", "val"],
        rows: [
          ["A", "1.005"],
          ["A", "2.005"],
          ["A", "3.005"],
        ],
        columns: [
          { name: "cat", type: "string", index: 0 },
          { name: "val", type: "number", index: 1 },
        ],
        rowCount: 3,
      };
      const result = processChartData(
        data,
        makeChart({ xAxis: "cat", yAxis: "val", aggregation: "avg" }),
      );
      // (1.005 + 2.005 + 3.005) / 3 = 2.005 (with float noise) → 6 significant digits
      expect(result[0]?.["val"]).toBe(2.005);
    });
  });
});

describe("processChartDataMultiSeries", () => {
  it("creates multi-series data with groupBy", () => {
    const chart = makeChart({
      groupBy: "region",
      aggregation: "sum",
    });
    const result = processChartDataMultiSeries(sampleData, chart);

    expect(result.seriesKeys).toContain("North");
    expect(result.seriesKeys).toContain("South");
    expect(result.data.length).toBeGreaterThan(0);

    const electronics = result.data.find(
      (d) => d["category"] === "Electronics",
    );
    expect(electronics?.["North"]).toBe(100);
    expect(electronics?.["South"]).toBe(200);
  });

  it("limits series to 8 maximum", () => {
    const manyGroups: TabularData = {
      headers: ["x", "y", "group"],
      rows: Array.from({ length: 20 }, (_, i) => ["A", "10", `Group${i}`]),
      columns: [
        { name: "x", type: "string", index: 0 },
        { name: "y", type: "number", index: 1 },
        { name: "group", type: "string", index: 2 },
      ],
      rowCount: 20,
    };
    const chart = makeChart({
      xAxis: "x",
      yAxis: "y",
      groupBy: "group",
      aggregation: "sum",
    });
    const result = processChartDataMultiSeries(manyGroups, chart);
    expect(result.seriesKeys.length).toBeLessThanOrEqual(8);
  });

  it("does not use groupBy for pie charts", () => {
    const chart = makeChart({
      type: "pie",
      groupBy: "region",
      aggregation: "sum",
    });
    const result = processChartDataMultiSeries(sampleData, chart);
    // Should fall through to single-series mode
    expect(result.seriesKeys).toEqual([]);
  });

  it("does not use groupBy for scatter charts", () => {
    const chart = makeChart({
      type: "scatter",
      groupBy: "region",
      aggregation: "sum",
    });
    const result = processChartDataMultiSeries(sampleData, chart);
    expect(result.seriesKeys).toEqual([]);
  });

  it("returns empty seriesKeys for single-series mode", () => {
    const chart = makeChart({ aggregation: "sum" }); // no groupBy
    const result = processChartDataMultiSeries(sampleData, chart);
    expect(result.seriesKeys).toEqual([]);
    expect(result.yKey).toBe("value");
  });

  it("leaves missing group values as gaps (null)", () => {
    const data: TabularData = {
      headers: ["x", "y", "g"],
      rows: [
        ["A", "10", "G1"],
        ["A", "20", "G2"],
        ["B", "30", "G1"],
        // B has no G2 entry
      ],
      columns: [
        { name: "x", type: "string", index: 0 },
        { name: "y", type: "number", index: 1 },
        { name: "g", type: "string", index: 2 },
      ],
      rowCount: 3,
    };
    const chart = makeChart({
      xAxis: "x",
      yAxis: "y",
      groupBy: "g",
      aggregation: "sum",
    });
    const result = processChartDataMultiSeries(data, chart);
    const bRow = result.data.find((d) => d["x"] === "B");
    expect(bRow?.["G2"]).toBeNull();
  });

  it("supports avg aggregation in multi-series", () => {
    const chart = makeChart({ groupBy: "region", aggregation: "avg" });
    const result = processChartDataMultiSeries(sampleData, chart);
    const food = result.data.find((d) => d["category"] === "Food");
    expect(food?.["North"]).toBe(300); // only one entry: 300/1
    expect(food?.["South"]).toBe(100); // only one entry: 100/1
  });

  it("supports count aggregation in multi-series", () => {
    const chart = makeChart({ groupBy: "region", aggregation: "count" });
    const result = processChartDataMultiSeries(sampleData, chart);
    const electronics = result.data.find(
      (d) => d["category"] === "Electronics",
    );
    expect(electronics?.["North"]).toBe(1);
    expect(electronics?.["South"]).toBe(1);
  });

  it("keeps the 8 groups with the largest totals", () => {
    const rows = Array.from({ length: 10 }, (_, i) => [
      "A",
      String(i + 1),
      `G${i + 1}`,
    ]);
    const data: TabularData = {
      headers: ["x", "y", "g"],
      rows,
      columns: [
        { name: "x", type: "string", index: 0 },
        { name: "y", type: "number", index: 1 },
        { name: "g", type: "string", index: 2 },
      ],
      rowCount: rows.length,
    };
    const result = processChartDataMultiSeries(
      data,
      makeChart({ xAxis: "x", yAxis: "y", groupBy: "g", aggregation: "sum" }),
    );
    expect(result.seriesKeys).toHaveLength(8);
    expect(result.seriesKeys).not.toContain("G1");
    expect(result.seriesKeys).not.toContain("G2");
    expect(result.seriesKeys).toContain("G10");
  });
});

describe("chart point selection", () => {
  const series = (type: "string" | "number" | "date", rows: string[][]) =>
    ({
      headers: ["x", "y"],
      rows,
      columns: [
        { name: "x", type, index: 0 },
        { name: "y", type: "number", index: 1 },
      ],
      rowCount: rows.length,
    }) satisfies TabularData;

  it("keeps the top N by value before limiting, in original order", () => {
    const data = series("string", [
      ["a", "1"],
      ["b", "50"],
      ["c", "2"],
      ["d", "40"],
    ]);
    const result = processChartData(
      data,
      makeChart({ xAxis: "x", yAxis: "y", aggregation: "sum" }),
      "none",
      2,
    );
    expect(result.map((p) => p["x"])).toEqual(["b", "d"]);
  });

  it("orders line charts over dates chronologically", () => {
    const data = series("date", [
      ["2024-03-01", "3"],
      ["2024-01-01", "1"],
      ["2024-02-01", "2"],
    ]);
    const result = processChartData(
      data,
      makeChart({ type: "line", xAxis: "x", yAxis: "y", aggregation: "sum" }),
    );
    expect(result.map((p) => p["x"])).toEqual([
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
    ]);
  });

  it("orders area charts over numbers numerically", () => {
    const data = series("number", [
      ["10", "3"],
      ["2", "1"],
      ["1,000", "2"],
    ]);
    const result = processChartData(
      data,
      makeChart({ type: "area", xAxis: "x", yAxis: "y", aggregation: "none" }),
    );
    expect(result.map((p) => p["x"])).toEqual(["2", "10", "1,000"]);
  });

  it("adds an Other slice holding the rest of a pie", () => {
    const data = series("string", [
      ["a", "10"],
      ["b", "20"],
      ["c", "5"],
      ["d", "1"],
    ]);
    const result = processChartData(
      data,
      makeChart({ type: "pie", xAxis: "x", yAxis: "y", aggregation: "sum" }),
      "desc",
      2,
    );
    expect(result).toEqual([
      { x: "b", y: 20 },
      { x: "a", y: 10 },
      { x: OTHER_LABEL, y: 6 },
    ]);
  });

  it("plots scatter points with numeric x, unsorted and without Top N", () => {
    const rows = Array.from({ length: 30 }, (_, i) => [
      String(30 - i),
      String(i),
    ]);
    const result = processChartData(
      series("number", rows),
      makeChart({
        type: "scatter",
        xAxis: "x",
        yAxis: "y",
        aggregation: "none",
      }),
      "none",
      10,
    );
    expect(result).toHaveLength(30);
    expect(result[0]).toEqual({ x: 30, y: 0 });
  });

  it("caps scatter charts at the point limit", () => {
    const rows = Array.from({ length: SCATTER_POINT_LIMIT + 500 }, (_, i) => [
      String(i),
      String(i),
    ]);
    const result = processChartData(
      series("number", rows),
      makeChart({
        type: "scatter",
        xAxis: "x",
        yAxis: "y",
        aggregation: "none",
      }),
    );
    expect(result).toHaveLength(SCATTER_POINT_LIMIT);
  });

  it("keeps small averages precise", () => {
    const data = series("string", [
      ["a", "0.0001234567"],
      ["a", "0.0001234567"],
    ]);
    const result = processChartData(
      data,
      makeChart({ xAxis: "x", yAxis: "y", aggregation: "avg" }),
    );
    expect(result[0]?.["y"]).toBe(0.000123457);
  });
});
