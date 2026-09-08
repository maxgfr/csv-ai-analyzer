"use client";

import { useEffect, useMemo, useState } from "react";
import { Upload, X } from "lucide-react";
import {
  DEFAULT_CSV_SETTINGS,
  type CSVData,
  type CSVSettings,
} from "~/lib/csv-parser";
import {
  isSupportedFile,
  isXLSXFile,
  SPREADSHEET_ACCEPT,
} from "~/lib/xlsx-parser";
import { useDataTask } from "~/lib/use-data-task";
import type { ImportSource } from "~/lib/data-tasks";

interface FileUploadProps {
  onFileLoaded?: (content: string, fileName: string) => void;
  onDataLoaded: (
    data: CSVData,
    fileName: string,
    source?: ImportSource,
  ) => void;
  csvSettings?: CSVSettings;
  currentFileName?: string;
  initialFile?: File;
  embedded?: boolean;
  onClear: () => void;
}

export function FileUpload({
  onDataLoaded,
  csvSettings = DEFAULT_CSV_SETTINGS,
  initialFile,
  embedded = false,
  onClear,
}: FileUploadProps) {
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [settings, setSettings] = useState(csvSettings);
  const [sheet, setSheet] = useState<string>();
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  useEffect(() => setSettings(csvSettings), [csvSettings]);
  const input = useMemo(
    () => (file ? { file, settings, sheet } : null),
    [file, settings, sheet],
  );
  const task = useDataTask("import", input);
  // Keep the selector visible during re-parsing, while the new result is pending.
  const [sheets, setSheets] = useState<string[]>([]);
  useEffect(() => {
    if (task.result) setSheets(task.result.sheets);
  }, [task.result]);
  const choose = (next: File | undefined) => {
    if (!next) return;
    if (!isSupportedFile(next.name)) {
      setError("Please choose a CSV or Excel (.xlsx) file.");
      return;
    }
    setError(undefined);
    setFile(next);
    setSheet(undefined);
    setSheets([]);
  };
  const control =
    "w-full rounded-lg border border-white/20 bg-gray-900 px-3 py-2 text-sm text-white";
  return (
    <div className={embedded ? "space-y-4" : "glass-card space-y-4 p-6"}>
      {!file ? (
        <label
          className={`block cursor-pointer rounded-xl border border-dashed p-6 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-violet-500 hover:border-violet-400 sm:p-8 ${dragging ? "border-violet-400 bg-violet-500/10" : "border-white/30"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files[0]);
          }}
        >
          <Upload className="mx-auto mb-3 h-8 w-8 text-violet-400" />
          <span className="block text-lg font-medium text-white">
            Drag &amp; drop your CSV or Excel file
          </span>
          <span className="mt-1 block text-sm text-gray-400">
            Preview the data and settings before importing.
          </span>
          <span className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white">
            <Upload aria-hidden="true" className="h-4 w-4" />
            Choose a file
          </span>
          <input
            aria-label="Choose CSV or Excel file"
            type="file"
            accept={SPREADSHEET_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate font-semibold text-white">
              Import preview — {file.name}
            </h3>
            <button
              type="button"
              aria-label="Cancel import"
              onClick={() => {
                setFile(null);
                setSheet(undefined);
                setSheets([]);
                onClear();
              }}
              className="rounded-lg p-2 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {!isXLSXFile(file.name) && (
              <>
                <label className="text-sm text-gray-300">
                  Delimiter
                  <select
                    aria-label="Import delimiter"
                    className={control}
                    value={settings.delimiter}
                    onChange={(e) =>
                      setSettings({ ...settings, delimiter: e.target.value })
                    }
                  >
                    <option value="">Auto-detect</option>
                    <option value=",">Comma</option>
                    <option value=";">Semicolon</option>
                    <option value={"\t"}>Tab</option>
                    <option value="|">Pipe</option>
                  </select>
                </label>
                <label className="text-sm text-gray-300">
                  Encoding
                  <select
                    aria-label="Import encoding"
                    className={control}
                    value={settings.encoding}
                    onChange={(e) =>
                      setSettings({ ...settings, encoding: e.target.value })
                    }
                  >
                    <option>UTF-8</option>
                    <option>ISO-8859-1</option>
                    <option>Windows-1252</option>
                  </select>
                </label>
              </>
            )}
            {sheets.length > 0 && (
              <label className="text-sm text-gray-300">
                Excel sheet
                <select
                  aria-label="Excel sheet"
                  className={control}
                  value={sheet ?? sheets[0]}
                  onChange={(e) => setSheet(e.target.value)}
                >
                  {sheets.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={settings.hasHeader}
                onChange={(e) =>
                  setSettings({ ...settings, hasHeader: e.target.checked })
                }
              />
              First row contains headers
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={settings.skipEmptyLines}
                onChange={(e) =>
                  setSettings({ ...settings, skipEmptyLines: e.target.checked })
                }
              />
              Skip empty rows
            </label>
          </div>
          {task.pending && (
            <p role="status" className="text-sm text-gray-300">
              Reading file and preparing preview…
            </p>
          )}
          {task.result && (
            <>
              <p className="text-sm text-gray-300">
                {task.result.data.rowCount} rows ·{" "}
                {task.result.data.headers.length} columns · first 20 rows shown
              </p>
              {task.result.warnings.map((warning) => (
                <p
                  role="status"
                  key={warning}
                  className="text-sm text-amber-400"
                >
                  {warning}
                </p>
              ))}
              <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {task.result.data.headers.map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 whitespace-nowrap text-gray-300"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {task.result.data.rows.slice(0, 20).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="max-w-64 truncate px-3 py-1 text-gray-400"
                            title={cell}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <button
            type="button"
            disabled={
              !task.result || task.pending || !task.result.data.headers.length
            }
            onClick={() => {
              if (task.result && input)
                onDataLoaded(task.result.data, file.name, input);
            }}
            className="rounded-xl bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Import data
          </button>
        </>
      )}
      {(error || task.error) && (
        <p role="alert" className="text-sm text-red-400">
          {error || task.error}
        </p>
      )}
    </div>
  );
}
