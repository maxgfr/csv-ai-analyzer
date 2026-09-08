"use client";

import { useState, useMemo, useDeferredValue } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Table2,
} from "lucide-react";
import { useDataTask } from "~/lib/use-data-task";
import { tableRows } from "~/lib/data-operations";
import type { CSVData } from "~/lib/csv-parser";

interface DataTableProps {
  data: CSVData;
}

const TYPE_COLORS: Record<string, string> = {
  string: "bg-blue-500/20 text-blue-400",
  number: "bg-green-500/20 text-green-400",
  date: "bg-purple-500/20 text-purple-400",
  boolean: "bg-amber-500/20 text-amber-400",
};

export function DataTable({ data }: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const task = useMemo(
    () => ({
      data,
      query: deferredQuery,
      sort:
        sortColumn === null || !data.headers[sortColumn]
          ? null
          : { column: data.headers[sortColumn]!, direction: sortDirection },
    }),
    [data, deferredQuery, sortColumn, sortDirection],
  );
  const useWorker =
    data.rowCount >= 10000 && (!!deferredQuery || sortColumn !== null);
  const asyncTask = useDataTask("table", useWorker ? task : null);
  const sortedRows = useMemo(
    () =>
      useWorker
        ? (asyncTask.result ?? [])
        : tableRows(data, deferredQuery, task.sort),
    [useWorker, asyncTask.result, data, deferredQuery, task.sort],
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedRows = sortedRows.slice(
    currentPage * rowsPerPage,
    (currentPage + 1) * rowsPerPage,
  );

  const handleSort = (columnIndex: number) => {
    if (sortColumn === columnIndex) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnIndex);
      setSortDirection("asc");
    }
    setPage(0);
  };

  return (
    <div className="glass-card flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 pt-6 pb-4">
        <div className="rounded-xl border border-violet-500/30 bg-linear-to-br from-violet-500/20 to-indigo-500/20 p-3">
          <Table2 className="h-6 w-6 text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">Data Preview</h3>
          <p className="text-sm text-gray-400">
            {data.rowCount} rows, {data.headers.length} columns
          </p>
        </div>
      </div>

      <div className="px-6 pb-4">
        <label
          htmlFor="table-search"
          className="mb-1 block text-sm text-gray-300"
        >
          Search visible columns
        </label>
        <input
          id="table-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search all rows…"
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
        />
        <p className="mt-1 text-xs text-gray-400">
          Search changes this preview only; analyses and exports use your
          transformed data.
        </p>
        {asyncTask.pending && <p role="status">Updating table…</p>}
        {asyncTask.error && <p role="alert">{asyncTask.error}</p>}
      </div>
      {/* Table Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {data.headers.map((header, i) => (
                <th
                  aria-sort={
                    sortColumn === i
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  key={`header-${header}-${i}`}
                  className="px-4 py-3 text-left font-medium text-gray-300"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(i)}
                    className="group flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <span>{header}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        TYPE_COLORS[data.columns[i]?.type ?? "string"] ??
                        TYPE_COLORS.string
                      }`}
                    >
                      {data.columns[i]?.type ?? "string"}
                    </span>
                    {sortColumn === i ? (
                      sortDirection === "asc" ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )
                    ) : (
                      <ChevronUp className="h-4 w-4 opacity-0 group-hover:opacity-30" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!paginatedRows.length && !asyncTask.pending && (
              <tr>
                <td
                  colSpan={Math.max(1, data.headers.length)}
                  className="px-4 py-6"
                >
                  No matching rows
                </td>
              </tr>
            )}
            {paginatedRows.map((row, rowIndex) => (
              <tr
                key={`row-${currentPage * rowsPerPage + rowIndex}`}
                className="border-b border-white/5 transition-colors hover:bg-white/5"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${currentPage * rowsPerPage + rowIndex}-${cellIndex}`}
                    className="px-4 py-3 text-gray-400"
                  >
                    <span
                      className="block max-w-[200px] truncate"
                      title={String(cell)}
                    >
                      {cell ?? "—"}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">Rows per page:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(0);
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-gray-300 focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {sortedRows.length ? currentPage * rowsPerPage + 1 : 0}-
            {Math.min((currentPage + 1) * rowsPerPage, sortedRows.length)} of{" "}
            {sortedRows.length}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => setPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="rounded-lg p-1.5 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4 text-gray-400" />
            </button>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              className="rounded-lg p-1.5 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
