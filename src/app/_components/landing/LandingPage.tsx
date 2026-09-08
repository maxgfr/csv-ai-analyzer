"use client";

import { useState } from "react";
import { Hero } from "./Hero";
import { FeaturesGrid } from "./FeaturesGrid";
import { HowItWorks } from "./HowItWorks";
import { generateDatasetById } from "~/lib/sample-data";
import { inferColumnType } from "~/lib/csv-parser";
import type { ImportSource } from "~/lib/data-tasks";
import type { CSVData, CSVSettings } from "~/lib/csv-parser";
import type { StoredSettings } from "~/lib/storage";

interface LandingPageProps {
  csvSettings: CSVSettings;
  apiSettings: StoredSettings | null;
  currentFileName: string | undefined;
  onSettingsChange: (settings: CSVSettings) => void;
  onApiSettingsChange: (settings: StoredSettings | null) => void;
  onFileLoaded: (content: string, fileName: string) => void;
  onClearFile: () => void;
  onDataLoaded: (
    data: CSVData,
    fileName: string,
    source?: ImportSource,
  ) => void;
}

export function LandingPage({
  csvSettings,
  apiSettings,
  currentFileName,
  onSettingsChange,
  onApiSettingsChange,
  onFileLoaded,
  onClearFile,
  onDataLoaded,
}: LandingPageProps) {
  const [showSampleDropdown, setShowSampleDropdown] = useState(false);

  const handleLoadSample = (datasetId: string) => {
    const dataset = generateDatasetById(datasetId);
    if (!dataset) return;

    // Convert to CSVData format
    const data: CSVData = {
      headers: dataset.headers,
      rows: dataset.rows,
      columns: dataset.headers.map((name, index) => ({
        name,
        type: inferColumnType(
          dataset.rows.slice(0, 100).map((row) => row[index] ?? ""),
        ),
        index,
      })),
      rowCount: dataset.rows.length,
    };

    onDataLoaded(data, dataset.name);
    setShowSampleDropdown(false);
  };

  return (
    <section className="animate-fade-in relative overflow-hidden">
      {/* Background gradient effects (moved from Hero) */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-violet-900/20 via-transparent to-fuchsia-900/20" />
      <div className="pointer-events-none absolute top-20 left-1/4 -z-10 h-96 w-96 rounded-full bg-violet-600/30 blur-3xl" />
      <div className="pointer-events-none absolute right-1/4 bottom-20 -z-10 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="relative z-10">
        <Hero
          csvSettings={csvSettings}
          apiSettings={apiSettings}
          currentFileName={currentFileName}
          showSampleDropdown={showSampleDropdown}
          onSettingsChange={onSettingsChange}
          onApiSettingsChange={onApiSettingsChange}
          onFileLoaded={onFileLoaded}
          onDataLoaded={onDataLoaded}
          onClearFile={onClearFile}
          onLoadSample={handleLoadSample}
          onToggleSampleDropdown={() =>
            setShowSampleDropdown(!showSampleDropdown)
          }
        />
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <FeaturesGrid />
          <HowItWorks />
          {/* Footer info */}
          <div className="mx-auto mt-16 max-w-2xl pb-16 text-center">
            <p className="text-sm text-gray-500">
              Built with Next.js, TailwindCSS, Recharts, and support for
              multiple AI providers.
            </p>
            <p className="mt-2 text-xs text-gray-600">
              v{process.env.NEXT_PUBLIC_APP_VERSION}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
