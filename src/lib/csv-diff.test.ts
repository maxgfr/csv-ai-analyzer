import { describe, it, expect } from "vitest";
import { computeDiff } from "csv-charts-ai";
import type { CSVData } from "./csv-parser";

/** Helper to build a minimal CSVData from headers + rows */
function makeData(headers: string[], rows: string[][]): CSVData {
  return {
    headers,
    rows,
    columns: headers.map((name, index) => ({ name, type: "string", index })),
    rowCount: rows.length,
  };
}

/* ────────────────────────── Index matching ────────────────────────── */

describe("computeDiff – index matching", () => {
  it("detects identical files", () => {
    const a = makeData(
      ["x", "y"],
      [
        ["1", "2"],
        ["3", "4"],
      ],
    );
    const b = makeData(
      ["x", "y"],
      [
        ["1", "2"],
        ["3", "4"],
      ],
    );
    const diff = computeDiff(a, b, { matchMode: "index" });

    expect(diff.counts).toEqual({ same: 2, changed: 0, added: 0, removed: 0 });
  });

  it("detects changed cells", () => {
    const a = makeData(
      ["name", "age"],
      [
        ["Alice", "30"],
        ["Bob", "25"],
      ],
    );
    const b = makeData(
      ["name", "age"],
      [
        ["Alice", "31"],
        ["Bob", "25"],
      ],
    );
    const diff = computeDiff(a, b, { matchMode: "index" });

    expect(diff.counts).toEqual({ same: 1, changed: 1, added: 0, removed: 0 });
    const changed = diff.rows.find((r) => r.status === "changed")!;
    expect(changed.changedCols.has("age")).toBe(true);
    expect(changed.changedCols.has("name")).toBe(false);
  });

  it("detects added rows when B has more rows", () => {
    const a = makeData(["x"], [["1"]]);
    const b = makeData(["x"], [["1"], ["2"], ["3"]]);
    const diff = computeDiff(a, b, { matchMode: "index" });

    expect(diff.counts).toEqual({ same: 1, changed: 0, added: 2, removed: 0 });
  });

  it("detects removed rows when A has more rows", () => {
    const a = makeData(["x"], [["1"], ["2"], ["3"]]);
    const b = makeData(["x"], [["1"]]);
    const diff = computeDiff(a, b, { matchMode: "index" });

    expect(diff.counts).toEqual({ same: 1, changed: 0, added: 0, removed: 2 });
  });

  it("handles empty files", () => {
    const a = makeData(["x"], []);
    const b = makeData(["x"], []);
    const diff = computeDiff(a, b, { matchMode: "index" });

    expect(diff.counts).toEqual({ same: 0, changed: 0, added: 0, removed: 0 });
    expect(diff.rows).toHaveLength(0);
  });

  it("compares only common columns when schemas differ", () => {
    const a = makeData(["id", "name", "extra"], [["1", "Alice", "foo"]]);
    const b = makeData(["id", "name", "other"], [["1", "Alice", "bar"]]);
    const diff = computeDiff(a, b, { matchMode: "index" });

    expect(diff.commonHeaders).toEqual(["id", "name"]);
    expect(diff.onlyInA).toEqual(["extra"]);
    expect(diff.onlyInB).toEqual(["other"]);
    expect(diff.counts.same).toBe(1);
    expect(diff.counts.changed).toBe(0);
  });
});

/* ────────────────────────── Key matching ────────────────────────── */

describe("computeDiff – key matching", () => {
  it("matches rows by key column", () => {
    const a = makeData(
      ["id", "name", "score"],
      [
        ["1", "Alice", "90"],
        ["2", "Bob", "85"],
        ["3", "Charlie", "70"],
      ],
    );
    const b = makeData(
      ["id", "name", "score"],
      [
        ["2", "Bob", "95"],
        ["3", "Charlie", "70"],
        ["4", "Dave", "88"],
      ],
    );
    const diff = computeDiff(a, b, { matchMode: "key", keyColumn: "id" });

    expect(diff.counts).toEqual({ same: 1, changed: 1, added: 1, removed: 1 });

    // Charlie is same
    const same = diff.rows.find((r) => r.status === "same")!;
    expect(same.rowA![0]).toBe("3");

    // Bob is changed (score)
    const changed = diff.rows.find((r) => r.status === "changed")!;
    expect(changed.rowA![0]).toBe("2");
    expect(changed.changedCols.has("score")).toBe(true);

    // Alice is removed
    const removed = diff.rows.find((r) => r.status === "removed")!;
    expect(removed.rowA![0]).toBe("1");

    // Dave is added
    const added = diff.rows.find((r) => r.status === "added")!;
    expect(added.rowB![0]).toBe("4");
  });

  it("falls back to index when key column is invalid", () => {
    const a = makeData(["x"], [["1"], ["2"]]);
    const b = makeData(["x"], [["1"], ["2"]]);
    const diff = computeDiff(a, b, {
      matchMode: "key",
      keyColumn: "nonexistent",
    });

    // Should fallback to index mode and find all same
    expect(diff.counts.same).toBe(2);
  });

  it("handles duplicate keys (uses first occurrence)", () => {
    const a = makeData(
      ["id", "val"],
      [
        ["1", "first"],
        ["1", "second"],
      ],
    );
    const b = makeData(["id", "val"], [["1", "first"]]);
    const diff = computeDiff(a, b, { matchMode: "key", keyColumn: "id" });

    // First "1" matches → same; second "1" in A is silently ignored by the map
    expect(diff.counts.same).toBe(1);
  });
});

/* ────────────────────────── Content matching ────────────────────────── */

describe("computeDiff – content matching", () => {
  it("finds subset rows correctly", () => {
    const a = makeData(
      ["name", "age", "city"],
      [
        ["Alice", "30", "Paris"],
        ["Bob", "25", "London"],
        ["Charlie", "35", "Berlin"],
        ["Dave", "28", "Rome"],
      ],
    );
    // B is a subset of A (rows 1 and 3)
    const b = makeData(
      ["name", "age", "city"],
      [
        ["Bob", "25", "London"],
        ["Dave", "28", "Rome"],
      ],
    );
    const diff = computeDiff(a, b, { matchMode: "content" });

    expect(diff.counts).toEqual({ same: 2, changed: 0, added: 0, removed: 2 });
  });

  it("works when B has extra columns removed", () => {
    const a = makeData(
      ["id", "name", "salary"],
      [
        ["1", "Alice", "50000"],
        ["2", "Bob", "60000"],
        ["3", "Charlie", "70000"],
      ],
    );
    // B has same rows but without "id" column
    const b = makeData(
      ["name", "salary"],
      [
        ["Alice", "50000"],
        ["Charlie", "70000"],
      ],
    );
    const diff = computeDiff(a, b, { matchMode: "content" });

    // Common columns: name, salary → 2 matched, 1 removed (Bob)
    expect(diff.commonHeaders).toEqual(["name", "salary"]);
    expect(diff.counts).toEqual({ same: 2, changed: 0, added: 0, removed: 1 });
  });

  it("detects added rows in B not present in A", () => {
    const a = makeData(["x"], [["1"], ["2"]]);
    const b = makeData(["x"], [["1"], ["2"], ["3"]]);
    const diff = computeDiff(a, b, { matchMode: "content" });

    expect(diff.counts).toEqual({ same: 2, changed: 0, added: 1, removed: 0 });
  });

  it("handles identical files", () => {
    const a = makeData(
      ["a", "b"],
      [
        ["1", "2"],
        ["3", "4"],
      ],
    );
    const b = makeData(
      ["a", "b"],
      [
        ["1", "2"],
        ["3", "4"],
      ],
    );
    const diff = computeDiff(a, b, { matchMode: "content" });

    expect(diff.counts).toEqual({ same: 2, changed: 0, added: 0, removed: 0 });
  });

  it("handles duplicate rows correctly", () => {
    const a = makeData(["x"], [["A"], ["A"], ["B"]]);
    const b = makeData(["x"], [["A"], ["B"]]);
    const diff = computeDiff(a, b, { matchMode: "content" });

    // One "A" matches, one "A" is removed, "B" matches
    expect(diff.counts).toEqual({ same: 2, changed: 0, added: 0, removed: 1 });
  });

  it("handles completely different files", () => {
    const a = makeData(["x"], [["1"], ["2"]]);
    const b = makeData(["x"], [["3"], ["4"]]);
    const diff = computeDiff(a, b, { matchMode: "content" });

    expect(diff.counts).toEqual({ same: 0, changed: 0, added: 2, removed: 2 });
  });

  it("handles no common headers", () => {
    const a = makeData(["a"], [["1"]]);
    const b = makeData(["b"], [["1"]]);
    const diff = computeDiff(a, b, { matchMode: "content" });

    // No common columns → nothing can match: every row is removed or added
    expect(diff.commonHeaders).toEqual([]);
    expect(diff.noCommonColumns).toBe(true);
    expect(diff.counts).toEqual({ same: 0, changed: 0, added: 1, removed: 1 });
  });
});

/* ────────────────────────── Schema analysis ────────────────────────── */

describe("computeDiff – schema analysis", () => {
  it("identifies schema differences", () => {
    const a = makeData(["a", "b", "c"], [["1", "2", "3"]]);
    const b = makeData(["b", "c", "d"], [["2", "3", "4"]]);
    const diff = computeDiff(a, b, { matchMode: "index" });

    expect(diff.commonHeaders).toEqual(["b", "c"]);
    expect(diff.onlyInA).toEqual(["a"]);
    expect(diff.onlyInB).toEqual(["d"]);
  });

  it("returns empty arrays when schemas are identical", () => {
    const a = makeData(["x", "y"], [["1", "2"]]);
    const b = makeData(["x", "y"], [["1", "2"]]);
    const diff = computeDiff(a, b, { matchMode: "index" });

    expect(diff.onlyInA).toEqual([]);
    expect(diff.onlyInB).toEqual([]);
  });
});
