"use client";

import { useState, useMemo, useEffect } from "react";
import {
  GitCompareArrows,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FileSpreadsheet,
  Columns3,
  Key,
  Hash,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  ScanSearch,
} from "lucide-react";
import { useDataTask } from "~/lib/use-data-task";
import { FileUpload } from "./FileUpload";
import {
  type CSVData,
  type CSVSettings,
  DEFAULT_CSV_SETTINGS,
} from "~/lib/csv-parser";
import type { MatchMode, DiffStatus } from "~/lib/csv-diff";

/* ── Types ── */

type DiffFilter = "all" | "changes" | "added" | "removed";

/* ── Constants ── */

const PAGE_SIZE = 50;

/* ── Component ── */

interface CSVCompareProps {
  primaryData: CSVData;
  primaryFileName?: string;
  csvSettings?: CSVSettings;
}

export function CSVCompare({
  primaryData,
  primaryFileName = "Original file",
  csvSettings = DEFAULT_CSV_SETTINGS,
}: CSVCompareProps) {
  const [compareData, setCompareData] = useState<CSVData | null>(null);
  const [compareFileName, setCompareFileName] = useState("");

  const [matchMode, setMatchMode] = useState<MatchMode>("index");
  const [keyColumn, setKeyColumn] = useState("");
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("changes");
  const [currentPage, setCurrentPage] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const handleRemove = () => {
    setCompareData(null);
    setCompareFileName("");
    setCurrentPage(0);
  };

  // Auto-select a valid key column when compare data or primary headers change
  useEffect(() => {
    if (!compareData) return;
    const common = primaryData.headers.filter((h) =>
      compareData.headers.includes(h),
    );
    if (!common.includes(keyColumn) && common.length > 0) {
      setKeyColumn(common[0]!);
    }
  }, [primaryData.headers, compareData, keyColumn]);

  const task = useMemo(
    () =>
      compareData
        ? { a: primaryData, b: compareData, options: { matchMode, keyColumn } }
        : null,
    [primaryData, compareData, matchMode, keyColumn],
  );
  const asyncDiff = useDataTask("diff", task);
  const diff = asyncDiff.result ?? null;
  useEffect(() => setCurrentPage(0), [task, diffFilter]);

  /* ── Filtered & paginated rows ── */

  const filteredRows = useMemo(() => {
    if (!diff) return [];
    switch (diffFilter) {
      case "changes":
        return diff.rows.filter((r) => r.status !== "same");
      case "added":
        return diff.rows.filter((r) => r.status === "added");
      case "removed":
        return diff.rows.filter((r) => r.status === "removed");
      default:
        return diff.rows;
    }
  }, [diff, diffFilter]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const paginatedRows = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  const setFilter = (f: DiffFilter) => {
    setDiffFilter(f);
    setCurrentPage(0);
  };

  /* ── Helpers ── */

  const fmt = (n: number) =>
    Math.abs(n) >= 1000
      ? n.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : n.toFixed(2);

  /* ── Render ── */

  return (
    <div className="glass-card animate-fade-in flex flex-1 flex-col p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <div className="rounded-xl border border-cyan-500/30 bg-linear-to-br from-cyan-500/20 to-blue-500/20 p-3">
          <GitCompareArrows className="h-6 w-6 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">CSV Compare</h3>
          <p className="text-sm text-gray-400">
            {compareData
              ? "Side-by-side comparison of your two files"
              : "Upload a second file to compare with your data"}
          </p>
        </div>
        {compareData && (
          <button
            onClick={handleRemove}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
      </div>

      {asyncDiff.pending && <p role="status">Comparing files…</p>}
      {asyncDiff.error && <p role="alert">{asyncDiff.error}</p>}
      {diff?.duplicateKeys &&
        (diff.duplicateKeys.a > 0 || diff.duplicateKeys.b > 0) && (
          <p role="status" className="mb-3 text-sm text-amber-400">
            Repeated keys: {diff.duplicateKeys.a} in A, {diff.duplicateKeys.b}{" "}
            in B. Occurrences are matched in file order; all rows are preserved.
          </p>
        )}
      {!compareData ? (
        <FileUpload
          csvSettings={csvSettings}
          onClear={() => {}}
          onDataLoaded={(data, name) => {
            setCompareData(data);
            setCompareFileName(name);
            setCurrentPage(0);
            setDiffFilter("changes");
          }}
        />
      ) : (
        /* ── Comparison view ── */
        <div className="flex flex-1 flex-col space-y-5 overflow-y-auto">
          {/* File overview cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-violet-400" />
                <span className="text-xs font-medium tracking-wider text-gray-500 uppercase">
                  File A
                </span>
              </div>
              <p
                className="truncate text-sm font-medium text-gray-200"
                title={primaryFileName}
              >
                {primaryFileName}
              </p>
              <div className="mt-2 flex gap-3 text-xs text-gray-500">
                <span>
                  <span className="font-mono text-gray-300">
                    {primaryData.rowCount}
                  </span>{" "}
                  rows
                </span>
                <span>
                  <span className="font-mono text-gray-300">
                    {primaryData.headers.length}
                  </span>{" "}
                  cols
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-cyan-500/10 bg-cyan-500/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-medium tracking-wider text-gray-500 uppercase">
                  File B
                </span>
              </div>
              <p
                className="truncate text-sm font-medium text-gray-200"
                title={compareFileName}
              >
                {compareFileName}
              </p>
              <div className="mt-2 flex gap-3 text-xs text-gray-500">
                <span>
                  <span className="font-mono text-gray-300">
                    {compareData.rowCount}
                  </span>{" "}
                  rows
                </span>
                <span>
                  <span className="font-mono text-gray-300">
                    {compareData.headers.length}
                  </span>{" "}
                  cols
                </span>
              </div>
            </div>
          </div>

          {/* Match mode selector */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
            <span className="text-xs font-medium text-gray-500">
              Match rows by
            </span>
            <div className="flex gap-1 rounded-lg bg-white/5 p-0.5">
              <button
                onClick={() => {
                  setMatchMode("index");
                  setCurrentPage(0);
                }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  matchMode === "index"
                    ? "bg-cyan-500/20 text-cyan-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Hash className="h-3 w-3" />
                Row index
              </button>
              <button
                onClick={() => {
                  setMatchMode("content");
                  setCurrentPage(0);
                }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  matchMode === "content"
                    ? "bg-cyan-500/20 text-cyan-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <ScanSearch className="h-3 w-3" />
                Content
              </button>
              <button
                onClick={() => {
                  setMatchMode("key");
                  setCurrentPage(0);
                }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  matchMode === "key"
                    ? "bg-cyan-500/20 text-cyan-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Key className="h-3 w-3" />
                Key column
              </button>
            </div>
            {matchMode === "key" && diff && (
              <select
                value={keyColumn}
                onChange={(e) => {
                  setKeyColumn(e.target.value);
                  setCurrentPage(0);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none"
              >
                {diff.commonHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            )}
          </div>

          {diff && (
            <>
              {/* Diff summary */}
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    {
                      label: "Identical",
                      count: diff.counts.same,
                      color: "text-gray-400",
                      bg: "bg-white/[0.03]",
                      border: "border-white/5",
                    },
                    {
                      label: "Modified",
                      count: diff.counts.changed,
                      color: "text-amber-400",
                      bg: "bg-amber-500/[0.05]",
                      border: "border-amber-500/10",
                    },
                    {
                      label: "Added",
                      count: diff.counts.added,
                      color: "text-emerald-400",
                      bg: "bg-emerald-500/[0.05]",
                      border: "border-emerald-500/10",
                    },
                    {
                      label: "Removed",
                      count: diff.counts.removed,
                      color: "text-red-400",
                      bg: "bg-red-500/[0.05]",
                      border: "border-red-500/10",
                    },
                  ] as const
                ).map(({ label, count, color, bg, border }) => (
                  <div
                    key={label}
                    className={`rounded-xl border ${border} ${bg} px-3 py-2.5 text-center`}
                  >
                    <div className={`font-mono text-lg font-semibold ${color}`}>
                      {count}
                    </div>
                    <div className="text-[10px] font-medium text-gray-500 uppercase">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Schema differences */}
              {(diff.onlyInA.length > 0 || diff.onlyInB.length > 0) && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Columns3 className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-300">
                      Schema differences
                    </span>
                  </div>
                  <div className="space-y-3">
                    {diff.onlyInA.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs text-amber-400/80">
                          Only in File A
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {diff.onlyInA.map((h) => (
                            <span
                              key={h}
                              className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300"
                            >
                              {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {diff.onlyInB.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs text-blue-400/80">
                          Only in File B
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {diff.onlyInB.map((h) => (
                            <span
                              key={h}
                              className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300"
                            >
                              {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Diff filter tabs + row count */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-300">
                  Row differences
                </span>
                <div className="ml-auto flex gap-1 rounded-lg bg-white/5 p-0.5">
                  {(
                    [
                      {
                        key: "all" as DiffFilter,
                        label: "All",
                        count: diff.rows.length,
                      },
                      {
                        key: "changes" as DiffFilter,
                        label: "Changes",
                        count:
                          diff.counts.changed +
                          diff.counts.added +
                          diff.counts.removed,
                      },
                      {
                        key: "added" as DiffFilter,
                        label: "Added",
                        count: diff.counts.added,
                      },
                      {
                        key: "removed" as DiffFilter,
                        label: "Removed",
                        count: diff.counts.removed,
                      },
                    ] as const
                  ).map(({ key, label, count }) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        diffFilter === key
                          ? "bg-white/10 text-white"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {label}
                      <span className="ml-1 font-mono opacity-60">{count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Diff table */}
              {filteredRows.length > 0 ? (
                <div className="flex flex-col overflow-hidden rounded-xl border border-white/10">
                  <div className="max-h-[50vh] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-white/10 bg-slate-900">
                          <th className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-gray-500">
                            #
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-gray-500">
                            Status
                          </th>
                          {diff.commonHeaders.map((h) => (
                            <th
                              key={h}
                              className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-gray-500"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row, i) => {
                          const rowBg =
                            row.status === "added"
                              ? "bg-emerald-500/[0.04]"
                              : row.status === "removed"
                                ? "bg-red-500/[0.04]"
                                : row.status === "changed"
                                  ? "bg-amber-500/[0.03]"
                                  : "";

                          return (
                            <tr
                              key={`${row.status}-${row.indexA ?? "n"}-${row.indexB ?? "n"}-${i}`}
                              className={`border-b border-white/5 ${rowBg}`}
                            >
                              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-gray-600">
                                {row.indexA != null ? row.indexA + 1 : "–"}
                                {row.indexA != null &&
                                row.indexB != null &&
                                row.indexA === row.indexB
                                  ? ""
                                  : ` / ${row.indexB != null ? row.indexB + 1 : "–"}`}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <StatusBadge status={row.status} />
                              </td>
                              {diff.commonHeaders.map((h) => {
                                const aIdx = primaryData.headers.indexOf(h);
                                const bIdx = compareData.headers.indexOf(h);
                                const aVal = row.rowA
                                  ? String(row.rowA[aIdx] ?? "")
                                  : "";
                                const bVal = row.rowB
                                  ? String(row.rowB[bIdx] ?? "")
                                  : "";
                                const isChanged = row.changedCols.has(h);

                                return (
                                  <td
                                    key={h}
                                    className={`max-w-[200px] truncate px-3 py-2 whitespace-nowrap ${
                                      isChanged ? "bg-amber-500/10" : ""
                                    }`}
                                    title={
                                      isChanged
                                        ? `${aVal} → ${bVal}`
                                        : row.status === "added"
                                          ? bVal
                                          : aVal
                                    }
                                  >
                                    {row.status === "added" ? (
                                      <span className="text-emerald-400">
                                        {bVal || "–"}
                                      </span>
                                    ) : row.status === "removed" ? (
                                      <span className="text-red-400">
                                        {aVal || "–"}
                                      </span>
                                    ) : isChanged ? (
                                      <span className="flex items-center gap-1">
                                        <span className="text-red-400/70 line-through">
                                          {aVal || "–"}
                                        </span>
                                        <ArrowRight className="h-3 w-3 shrink-0 text-gray-600" />
                                        <span className="text-amber-300">
                                          {bVal || "–"}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">
                                        {aVal || "–"}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-white/5 px-4 py-2">
                      <span className="text-xs text-gray-500">
                        {currentPage * PAGE_SIZE + 1}–
                        {Math.min(
                          (currentPage + 1) * PAGE_SIZE,
                          filteredRows.length,
                        )}{" "}
                        of {filteredRows.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setCurrentPage((p) => Math.max(0, p - 1))
                          }
                          disabled={currentPage === 0}
                          className="rounded-md p-1 text-gray-400 hover:bg-white/5 hover:text-white disabled:opacity-30"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="px-2 text-xs text-gray-400">
                          {currentPage + 1} / {totalPages}
                        </span>
                        <button
                          onClick={() =>
                            setCurrentPage((p) =>
                              Math.min(totalPages - 1, p + 1),
                            )
                          }
                          disabled={currentPage >= totalPages - 1}
                          className="rounded-md p-1 text-gray-400 hover:bg-white/5 hover:text-white disabled:opacity-30"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-white/5 bg-white/[0.01] py-8 text-sm text-gray-500">
                  {diffFilter === "changes"
                    ? "No differences found — files are identical"
                    : "No rows match this filter"}
                </div>
              )}

              {/* Column statistics (collapsible) */}
              {diff.stats.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-white/5">
                  <button
                    onClick={() => setShowStats(!showStats)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                  >
                    <span className="flex-1 text-sm font-medium text-gray-300">
                      Column statistics
                    </span>
                    <span className="text-xs text-gray-500">
                      {diff.commonHeaders.length} shared column
                      {diff.commonHeaders.length !== 1 ? "s" : ""}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-gray-500 transition-transform ${
                        showStats ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {showStats && (
                    <div className="overflow-x-auto border-t border-white/5">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/[0.03]">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                              Column
                            </th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-violet-400/60">
                              File A
                            </th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-cyan-400/60">
                              File B
                            </th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                              Change
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {diff.stats.map((stat) => {
                            if (stat.type === "categorical") {
                              const delta =
                                (stat.compare.distinct ?? 0) -
                                (stat.primary.distinct ?? 0);
                              return (
                                <tr
                                  key={stat.column}
                                  className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                                >
                                  <td className="px-4 py-2.5">
                                    <span className="font-medium text-gray-300">
                                      {stat.column}
                                    </span>
                                    <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
                                      text
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-gray-400">
                                    {stat.primary.distinct}
                                    <span className="ml-1 font-sans text-xs text-gray-600">
                                      distinct
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-gray-400">
                                    {stat.compare.distinct}
                                    <span className="ml-1 font-sans text-xs text-gray-600">
                                      distinct
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <DeltaBadge value={delta} />
                                  </td>
                                </tr>
                              );
                            }

                            const pAvg = stat.primary.avg ?? 0;
                            const cAvg = stat.compare.avg ?? 0;
                            const delta = cAvg - pAvg;
                            const pct = pAvg !== 0 ? (delta / pAvg) * 100 : 0;

                            return (
                              <tr
                                key={stat.column}
                                className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                              >
                                <td className="px-4 py-2.5">
                                  <span className="font-medium text-gray-300">
                                    {stat.column}
                                  </span>
                                  <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
                                    avg
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-gray-300">
                                  {fmt(pAvg)}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-gray-300">
                                  {fmt(cAvg)}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <DeltaBadge
                                    value={delta}
                                    label={`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helper components ── */

function StatusBadge({ status }: { status: DiffStatus }) {
  const config = {
    same: { label: "Same", cls: "text-gray-500 bg-white/5" },
    changed: { label: "Modified", cls: "text-amber-400 bg-amber-500/10" },
    added: { label: "Added", cls: "text-emerald-400 bg-emerald-500/10" },
    removed: { label: "Removed", cls: "text-red-400 bg-red-500/10" },
  }[status];

  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${config.cls}`}
    >
      {config.label}
    </span>
  );
}

function DeltaBadge({ value, label }: { value: number; label?: string }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-gray-500">
        <Minus className="h-3 w-3" />0
      </span>
    );
  }

  const isPositive = value > 0;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  const colorClass = isPositive ? "text-emerald-400" : "text-red-400";

  const fmt = (n: number) =>
    Math.abs(n) >= 1000
      ? n.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : Math.abs(n) < 0.01
        ? n.toExponential(1)
        : n.toFixed(2);

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-xs ${colorClass}`}
    >
      <Icon className="h-3 w-3" />
      {isPositive ? "+" : ""}
      {fmt(value)}
      {label && <span className="text-[10px] opacity-70">{label}</span>}
    </span>
  );
}
