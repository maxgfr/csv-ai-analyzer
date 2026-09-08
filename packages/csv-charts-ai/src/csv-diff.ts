import type { TabularData } from "./types";

/* ── Types ── */

export type MatchMode = "index" | "key" | "content";
export type DiffStatus = "same" | "changed" | "added" | "removed";

export interface DiffRow {
  indexA: number | null;
  indexB: number | null;
  status: DiffStatus;
  rowA: (string | number)[] | null;
  rowB: (string | number)[] | null;
  changedCols: Set<string>;
}

export interface DiffCounts {
  same: number;
  changed: number;
  added: number;
  removed: number;
}

export interface DiffResult {
  commonHeaders: string[];
  onlyInA: string[];
  onlyInB: string[];
  rows: DiffRow[];
  counts: DiffCounts;
  /** Number of repeated key occurrences in each input. */
  duplicateKeys?: { a: number; b: number };
}

export interface DiffOptions {
  matchMode: MatchMode;
  keyColumn?: string;
}

/* ── Diff computation ── */

export function computeDiff(
  primaryData: TabularData,
  compareData: TabularData,
  options: DiffOptions,
): DiffResult {
  const { matchMode, keyColumn = "" } = options;

  const bHeaderSet = new Set(compareData.headers);
  const aHeaderSet = new Set(primaryData.headers);

  const commonHeaders = primaryData.headers.filter((h) => bHeaderSet.has(h));
  const onlyInA = primaryData.headers.filter((h) => !bHeaderSet.has(h));
  const onlyInB = compareData.headers.filter((h) => !aHeaderSet.has(h));

  const rows: DiffRow[] = [];
  let duplicateKeys: { a: number; b: number } | undefined;

  // Pre-compute header → index maps to avoid O(n) indexOf calls per row
  const aHeaderIdx = new Map<string, number>();
  const bHeaderIdx = new Map<string, number>();
  for (let i = 0; i < primaryData.headers.length; i++)
    aHeaderIdx.set(primaryData.headers[i]!, i);
  for (let i = 0; i < compareData.headers.length; i++)
    bHeaderIdx.set(compareData.headers[i]!, i);

  // Pre-compute common header index pairs for fast row comparison
  const commonIdxPairs = commonHeaders.map((h) => ({
    header: h,
    aIdx: aHeaderIdx.get(h)!,
    bIdx: bHeaderIdx.get(h)!,
  }));

  const getChangedCols = (
    a: (string | number)[],
    b: (string | number)[],
  ): Set<string> => {
    const changed = new Set<string>();
    for (const { header, aIdx, bIdx } of commonIdxPairs) {
      if (String(a[aIdx] ?? "") !== String(b[bIdx] ?? "")) {
        changed.add(header);
      }
    }
    return changed;
  };

  // Determine effective match mode
  const effectiveMode =
    matchMode === "content"
      ? "content"
      : matchMode === "key" && keyColumn && commonHeaders.includes(keyColumn)
        ? "key"
        : "index";

  if (effectiveMode === "content") {
    const makeKey = (row: (string | number)[], indices: number[]) => {
      let key = "";
      for (const index of indices) {
        const value = String(row[index] ?? "");
        key += `${value.length}:${value}`;
      }
      return key;
    };
    const aIndices = commonIdxPairs.map((pair) => pair.aIdx);
    const bIndices = commonIdxPairs.map((pair) => pair.bIdx);

    const aMap = new Map<string, number[]>();
    for (let i = 0; i < primaryData.rows.length; i++) {
      const key = makeKey(primaryData.rows[i]!, aIndices);
      const list = aMap.get(key) ?? [];
      list.push(i);
      aMap.set(key, list);
    }

    const matchedAIndices = new Uint8Array(primaryData.rows.length);
    const cursors = new Map<string, number>();

    for (let i = 0; i < compareData.rows.length; i++) {
      const key = makeKey(compareData.rows[i]!, bIndices);
      const candidates = aMap.get(key);

      if (candidates) {
        const cursor = cursors.get(key) ?? 0;
        const match = candidates[cursor];
        cursors.set(key, cursor + 1);
        if (match !== undefined) {
          matchedAIndices[match] = 1;
          rows.push({
            indexA: match,
            indexB: i,
            status: "same",
            rowA: primaryData.rows[match]!,
            rowB: compareData.rows[i]!,
            changedCols: new Set(),
          });
        } else {
          rows.push({
            indexA: null,
            indexB: i,
            status: "added",
            rowA: null,
            rowB: compareData.rows[i]!,
            changedCols: new Set(),
          });
        }
      } else {
        rows.push({
          indexA: null,
          indexB: i,
          status: "added",
          rowA: null,
          rowB: compareData.rows[i]!,
          changedCols: new Set(),
        });
      }
    }

    for (let i = 0; i < primaryData.rows.length; i++) {
      if (!matchedAIndices[i]) {
        rows.push({
          indexA: i,
          indexB: null,
          status: "removed",
          rowA: primaryData.rows[i]!,
          rowB: null,
          changedCols: new Set(),
        });
      }
    }
  } else if (effectiveMode === "index") {
    const maxLen = Math.max(primaryData.rows.length, compareData.rows.length);
    for (let i = 0; i < maxLen; i++) {
      const a = i < primaryData.rows.length ? primaryData.rows[i]! : null;
      const b = i < compareData.rows.length ? compareData.rows[i]! : null;

      if (!a) {
        rows.push({
          indexA: null,
          indexB: i,
          status: "added",
          rowA: null,
          rowB: b,
          changedCols: new Set(),
        });
      } else if (!b) {
        rows.push({
          indexA: i,
          indexB: null,
          status: "removed",
          rowA: a,
          rowB: null,
          changedCols: new Set(),
        });
      } else {
        const changedCols = getChangedCols(a, b);
        rows.push({
          indexA: i,
          indexB: i,
          status: changedCols.size > 0 ? "changed" : "same",
          rowA: a,
          rowB: b,
          changedCols,
        });
      }
    }
  } else {
    // Key-based matching
    const keyIdxA = aHeaderIdx.get(keyColumn)!;
    const keyIdxB = bHeaderIdx.get(keyColumn)!;

    const bMap = new Map<string, { indices: number[]; cursor: number }>();
    duplicateKeys = { a: 0, b: 0 };
    for (let i = 0; i < compareData.rows.length; i++) {
      const key = String(compareData.rows[i]![keyIdxB] ?? "");
      const bucket = bMap.get(key);
      if (bucket) {
        bucket.indices.push(i);
        duplicateKeys.b++;
      } else bMap.set(key, { indices: [i], cursor: 0 });
    }
    const seenA = new Set<string>();
    const matchedB = new Set<number>();
    for (let i = 0; i < primaryData.rows.length; i++) {
      const rowA = primaryData.rows[i]!;
      const key = String(rowA[keyIdxA] ?? "");
      if (seenA.has(key)) duplicateKeys.a++;
      seenA.add(key);
      const bucket = bMap.get(key);
      const indexB = bucket?.indices[bucket.cursor];
      if (indexB !== undefined && bucket) {
        bucket.cursor++;
        matchedB.add(indexB);
        const rowB = compareData.rows[indexB]!;
        const changedCols = getChangedCols(rowA, rowB);
        rows.push({
          indexA: i,
          indexB,
          rowA,
          rowB,
          changedCols,
          status: changedCols.size ? "changed" : "same",
        });
      } else {
        rows.push({
          indexA: i,
          indexB: null,
          rowA,
          rowB: null,
          status: "removed",
          changedCols: new Set(),
        });
      }
    }
    for (let i = 0; i < compareData.rows.length; i++) {
      if (!matchedB.has(i))
        rows.push({
          indexA: null,
          indexB: i,
          rowA: null,
          rowB: compareData.rows[i]!,
          status: "added",
          changedCols: new Set(),
        });
    }
  }

  // Single-pass count instead of 4 separate filter calls
  const counts: DiffCounts = { same: 0, changed: 0, added: 0, removed: 0 };
  for (const r of rows) {
    counts[r.status]++;
  }

  return {
    commonHeaders,
    onlyInA,
    onlyInB,
    rows,
    counts,
    ...(duplicateKeys && { duplicateKeys }),
  };
}
