"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Filter,
  Columns3,
  Plus,
  X,
  ArrowDownUp,
  Download,
  Undo2,
  AlertTriangle,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { useDataTask } from "~/lib/use-data-task";
import {
  transformData,
  type ColumnFilter,
  type SortConfig,
} from "~/lib/data-operations";
import type { CSVData } from "~/lib/csv-parser";

interface DataTransformProps {
  data: CSVData;
  onPendingChange?: (pending: boolean) => void;
  onTransformed?: (data: CSVData | null) => void;
}

type Section = "columns" | "sort" | "filters";

export function DataTransform({
  data,
  onTransformed,
  onPendingChange,
}: DataTransformProps) {
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [excludedColumns, setExcludedColumns] = useState<Set<string>>(
    new Set(),
  );
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [openSections, setOpenSections] = useState<Set<Section>>(new Set());

  const toggleSection = (section: Section) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const addFilter = () => {
    if (!data.headers[0]) return;
    setFilters((prev) => [
      ...prev,
      { column: data.headers[0]!, operator: "contains", value: "" },
    ]);
  };

  const removeFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, updates: Partial<ColumnFilter>) => {
    setFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f)),
    );
  };

  const toggleColumn = (col: string) => {
    setExcludedColumns((prev) => {
      const next = new Set(prev);
      if (!next.has(col) && next.size >= data.headers.length - 1) return prev;
      if (next.has(col)) {
        next.delete(col);
      } else {
        next.add(col);
      }
      return next;
    });
  };

  const resetAll = () => {
    setFilters([]);
    setExcludedColumns(new Set());
    setSortConfig(null);
  };

  const hasTransforms =
    filters.some(
      (f) => f.value || f.operator === "empty" || f.operator === "not_empty",
    ) ||
    excludedColumns.size > 0 ||
    sortConfig !== null;
  const task = useMemo(
    () => ({
      data,
      options: {
        filters,
        excludedColumns: [...excludedColumns],
        sort: sortConfig,
      },
    }),
    [data, filters, excludedColumns, sortConfig],
  );
  const asyncTask = useDataTask(
    "transform",
    hasTransforms && data.rowCount >= 10000 ? task : null,
  );
  const transformedData = useMemo(
    () =>
      data.rowCount >= 10000 && hasTransforms
        ? asyncTask.result
        : transformData(data, task.options),
    [data, task, asyncTask.result, hasTransforms],
  );
  useEffect(() => {
    onPendingChange?.(asyncTask.pending || !!asyncTask.error);
    return () => onPendingChange?.(false);
  }, [asyncTask.pending, asyncTask.error, onPendingChange]);

  // Auto-apply transforms to downstream analysis
  useEffect(() => {
    if (!onTransformed || !transformedData) return;
    onTransformed(hasTransforms ? transformedData : null);
  }, [transformedData, hasTransforms, onTransformed]);

  const handleExport = useCallback(() => {
    if (!transformedData) return;
    const escapeField = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      transformedData.headers.map(escapeField).join(","),
      ...transformedData.rows.map((r) =>
        r.map((v) => escapeField(String(v))).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transformed-data.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [transformedData]);

  const activeFiltersCount = filters.filter(
    (f) => f.value || f.operator === "empty" || f.operator === "not_empty",
  ).length;

  return (
    <div className="glass-card animate-fade-in flex flex-1 flex-col p-6">
      {asyncTask.pending && (
        <p role="status" className="mb-3 text-sm text-gray-300">
          Applying transforms…
        </p>
      )}
      {asyncTask.error && (
        <p role="alert" className="mb-3 text-sm text-red-400">
          {asyncTask.error}
        </p>
      )}
      {/* Header */}
      <div className="mb-4 flex items-center gap-4">
        <div className="rounded-xl border border-fuchsia-500/30 bg-linear-to-br from-fuchsia-500/20 to-pink-500/20 p-3">
          <SlidersHorizontal className="h-6 w-6 text-fuchsia-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">Data Transforms</h3>
            {hasTransforms && (
              <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-medium text-fuchsia-400">
                Active
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            Filter, sort, and reshape your data
          </p>
        </div>
        {hasTransforms && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              <span className="font-mono text-fuchsia-400">
                {transformedData?.rowCount}
              </span>{" "}
              / <span className="font-mono">{data.rowCount}</span> rows
            </span>
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              title="Reset all transforms"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Active transforms summary pills */}
      {hasTransforms &&
        !openSections.has("columns") &&
        !openSections.has("sort") &&
        !openSections.has("filters") && (
          <div className="mb-4 flex flex-wrap gap-2">
            {excludedColumns.size > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-300">
                <Columns3 className="h-3 w-3" />
                {excludedColumns.size} column
                {excludedColumns.size > 1 ? "s" : ""} hidden
              </span>
            )}
            {sortConfig && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-300">
                <ArrowDownUp className="h-3 w-3" />
                {sortConfig.column} {sortConfig.direction === "asc" ? "↑" : "↓"}
              </span>
            )}
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-300">
                <Filter className="h-3 w-3" />
                {activeFiltersCount} filter{activeFiltersCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

      {/* Accordion sections */}
      <div className="space-y-3">
        {/* Columns section */}
        <div className="overflow-hidden rounded-xl border border-white/20 bg-white/5">
          <button
            onClick={() => toggleSection("columns")}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
          >
            <Columns3 className="h-4 w-4 text-gray-400" />
            <span className="flex-1 text-sm font-medium text-gray-300">
              Columns
            </span>
            {excludedColumns.size > 0 && (
              <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs text-fuchsia-400">
                {data.headers.length - excludedColumns.size}/
                {data.headers.length}
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 text-gray-500 transition-transform ${
                openSections.has("columns") ? "rotate-180" : ""
              }`}
            />
          </button>
          {openSections.has("columns") && (
            <div className="border-t border-white/5 px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {data.headers.map((header) => (
                  <button
                    key={header}
                    onClick={() => toggleColumn(header)}
                    className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                      excludedColumns.has(header)
                        ? "border border-red-500/20 bg-red-500/10 text-red-400 line-through"
                        : "border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    {header}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sort section */}
        <div className="overflow-hidden rounded-xl border border-white/20 bg-white/5">
          <button
            onClick={() => toggleSection("sort")}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
          >
            <ArrowDownUp className="h-4 w-4 text-gray-400" />
            <span className="flex-1 text-sm font-medium text-gray-300">
              Sort
            </span>
            {sortConfig && (
              <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs text-fuchsia-400">
                {sortConfig.column} {sortConfig.direction === "asc" ? "↑" : "↓"}
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 text-gray-500 transition-transform ${
                openSections.has("sort") ? "rotate-180" : ""
              }`}
            />
          </button>
          {openSections.has("sort") && (
            <div className="border-t border-white/5 px-4 py-3">
              <div className="flex gap-2">
                <select
                  value={sortConfig?.column ?? ""}
                  onChange={(e) =>
                    setSortConfig(
                      e.target.value
                        ? {
                            column: e.target.value,
                            direction: sortConfig?.direction ?? "asc",
                          }
                        : null,
                    )
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-300 focus:border-violet-500/50 focus:outline-none"
                >
                  <option value="">No sort</option>
                  {data.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {sortConfig && (
                  <select
                    value={sortConfig.direction}
                    onChange={(e) =>
                      setSortConfig({
                        ...sortConfig,
                        direction: e.target.value as "asc" | "desc",
                      })
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-300 focus:border-violet-500/50 focus:outline-none"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Filters section */}
        <div className="overflow-hidden rounded-xl border border-white/20 bg-white/5">
          <button
            onClick={() => toggleSection("filters")}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
          >
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="flex-1 text-sm font-medium text-gray-300">
              Filters
            </span>
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs text-fuchsia-400">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 text-gray-500 transition-transform ${
                openSections.has("filters") ? "rotate-180" : ""
              }`}
            />
          </button>
          {openSections.has("filters") && (
            <div className="space-y-2 border-t border-white/5 px-4 py-3">
              {filters.length > 1 && (
                <p className="text-xs text-gray-500">
                  All conditions must match (AND)
                </p>
              )}
              {filters.map((filter, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={filter.column}
                    onChange={(e) =>
                      updateFilter(i, { column: e.target.value })
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-gray-300 focus:outline-none"
                  >
                    {data.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filter.operator}
                    onChange={(e) =>
                      updateFilter(i, {
                        operator: e.target.value as ColumnFilter["operator"],
                      })
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-gray-300 focus:outline-none"
                  >
                    <option value="contains">contains</option>
                    <option value="eq">equals</option>
                    <option value="neq">not equals</option>
                    <option value="gt">greater than</option>
                    <option value="lt">less than</option>
                    <option value="empty">is empty</option>
                    <option value="not_empty">is not empty</option>
                  </select>
                  {filter.operator !== "empty" &&
                    filter.operator !== "not_empty" && (
                      <input
                        type="text"
                        value={filter.value}
                        onChange={(e) =>
                          updateFilter(i, { value: e.target.value })
                        }
                        placeholder={
                          filter.operator === "gt" || filter.operator === "lt"
                            ? "Number..."
                            : "Value..."
                        }
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-violet-500/50 focus:outline-none"
                      />
                    )}
                  <button
                    aria-label={`Remove filter ${i + 1}`}
                    onClick={() => removeFilter(i)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={addFilter}
                className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Add filter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Empty rows warning */}
      {hasTransforms && transformedData?.rowCount === 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No rows match your current filters. Try adjusting your conditions.
        </div>
      )}

      {/* Export */}
      <div className="mt-auto border-t border-white/5 pt-4">
        <button
          disabled={!transformedData}
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>
    </div>
  );
}
