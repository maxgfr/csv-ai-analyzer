"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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

  const sortedRows = useMemo(() => {
    if (sortColumn === null) return data.rows;
    
    const sorted = [...data.rows].sort((a, b) => {
      const aVal = a[sortColumn] ?? "";
      const bVal = b[sortColumn] ?? "";
      
      // Try numeric sort first
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }
      
      // Fall back to string sort
      const comparison = String(aVal).localeCompare(String(bVal));
      return sortDirection === "asc" ? comparison : -comparison;
    });
    
    return sorted;
  }, [data.rows, sortColumn, sortDirection]);

  const paginatedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return sortedRows.slice(start, start + rowsPerPage);
  }, [sortedRows, page, rowsPerPage]);

  const totalPages = Math.ceil(data.rowCount / rowsPerPage);

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
    <div className="glass-card overflow-hidden">
      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {data.headers.map((header, i) => (
                <th
                  key={`header-${header}-${i}`}
                  className="px-4 py-3 text-left font-medium text-gray-300"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(i)}
                    className="flex items-center gap-2 hover:text-white transition-colors group"
                  >
                    <span>{header}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        TYPE_COLORS[data.columns[i]?.type ?? "string"] ?? TYPE_COLORS.string
                      }`}
                    >
                      {data.columns[i]?.type ?? "string"}
                    </span>
                    {sortColumn === i ? (
                      sortDirection === "asc" ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )
                    ) : (
                      <ChevronUp className="w-4 h-4 opacity-0 group-hover:opacity-30" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, rowIndex) => (
              <tr
                key={`row-${page * rowsPerPage + rowIndex}`}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${page * rowsPerPage + rowIndex}-${cellIndex}`}
                    className="px-4 py-3 text-gray-400"
                  >
                    <span className="max-w-[200px] truncate block" title={String(cell)}>
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
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">Rows per page:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(0);
            }}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
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
            {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, data.rowCount)} of{" "}
            {data.rowCount}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
