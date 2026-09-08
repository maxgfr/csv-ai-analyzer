"use client";
import { useDataTask } from "~/lib/use-data-task";
import type { CSVData } from "~/lib/csv-parser";
export function DataQuality({ data }: { data: CSVData }) {
  const { result, pending, error } = useDataTask("quality", data);
  return (
    <div className="glass-card p-6">
      <h3 className="font-semibold text-white">Local data quality</h3>
      <p className="mt-1 text-sm text-gray-400">
        Calculated in your browser. Data is never changed automatically.
      </p>
      {pending && (
        <p role="status" className="mt-3 text-sm">
          Checking values and duplicates…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p className="my-3 text-sm text-gray-300">
            {result.rowCount} rows · {result.duplicateRows} repeated rows beyond
            the first occurrence
          </p>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="py-2">Column</th>
                  <th>Missing</th>
                  <th>Type mismatches</th>
                </tr>
              </thead>
              <tbody>
                {result.columns.map((c) => (
                  <tr
                    key={c.name}
                    className="border-t border-white/10 text-gray-300"
                  >
                    <th scope="row" className="py-2 font-normal">
                      {c.name}
                    </th>
                    <td>{c.missing}</td>
                    <td>{c.invalid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Types are inferred from the first 100 rows. Mismatches are checked
            across all rows.
          </p>
        </>
      )}
    </div>
  );
}
