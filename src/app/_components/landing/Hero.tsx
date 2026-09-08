"use client";

import { Sparkles, Database, ChevronDown, Github } from "lucide-react";
import { FileUpload } from "../FileUpload";
import { APIKeyButton } from "../APIKeySettings";
import { CSVSettingsButton } from "../CSVSettings";
import { ThemeToggle } from "../ThemeToggle";
import { SAMPLE_DATASETS } from "~/lib/sample-data";
import type { ImportSource } from "~/lib/data-tasks";
import type { CSVData, CSVSettings } from "~/lib/csv-parser";
import type { StoredSettings } from "~/lib/storage";

interface HeroProps {
  csvSettings: CSVSettings;
  apiSettings: StoredSettings | null;
  currentFileName: string | undefined;
  showSampleDropdown: boolean;
  onSettingsChange: (settings: CSVSettings) => void;
  onApiSettingsChange: (settings: StoredSettings | null) => void;
  onFileLoaded: (content: string, fileName: string) => void;
  onDataLoaded: (
    data: CSVData,
    fileName: string,
    source?: ImportSource,
  ) => void;
  onClearFile: () => void;
  onLoadSample: (datasetId: string) => void;
  onToggleSampleDropdown: () => void;
}

export function Hero({
  csvSettings,
  apiSettings,
  currentFileName,
  showSampleDropdown,
  onSettingsChange,
  onApiSettingsChange,
  onFileLoaded,
  onDataLoaded,
  onClearFile,
  onLoadSample,
  onToggleSampleDropdown,
}: HeroProps) {
  return (
    <div>
      <div className="relative mx-auto max-w-7xl px-4 pt-12 pb-16 md:px-8">
        {/* Header */}
        <div className="mb-12 flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 p-3 shadow-lg shadow-violet-500/20">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1
                className="bg-clip-text text-3xl font-bold text-transparent"
                style={{
                  backgroundImage: `linear-gradient(to right, var(--text-heading-from), var(--text-heading-to))`,
                }}
              >
                CSV AI Analyzer
                <span
                  className="ml-2 align-middle text-xs font-normal"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  v{process.env.NEXT_PUBLIC_APP_VERSION}
                </span>
              </h1>
              <p style={{ color: "var(--text-secondary)" }}>
                Intelligent data analysis powered by AI
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <a
              href="https://github.com/maxgfr/csv-ai-analyzer"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-200"
              style={{
                borderColor: "var(--border-glass)",
                background: "var(--bg-glass)",
                color: "var(--text-secondary)",
              }}
              title="View source code on GitHub"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">Source Code</span>
            </a>
            <CSVSettingsButton
              settings={csvSettings}
              onSettingsChange={onSettingsChange}
            />
            <APIKeyButton
              onSettingsChange={onApiSettingsChange}
              currentSettings={apiSettings}
            />
          </div>
        </div>

        {/* Hero Content */}
        <div className="mx-auto mb-12 max-w-4xl text-center">
          <h2
            className="mb-6 bg-clip-text text-4xl font-bold text-transparent md:text-6xl"
            style={{
              backgroundImage: `linear-gradient(to right, var(--text-hero-from), var(--text-hero-via), var(--text-hero-to))`,
            }}
          >
            Analyze your CSV & Excel files with AI in seconds
          </h2>
          <p
            className="mx-auto mb-8 max-w-2xl text-xl"
            style={{ color: "var(--text-secondary)" }}
          >
            Upload your data, choose your AI provider (OpenAI, Anthropic,
            Google, and more), and get intelligent insights and chart
            suggestions.
            <span className="font-semibold text-violet-400">
              {" "}
              100% private
            </span>{" "}
            when using a self-hosted/custom endpoint.
          </p>
        </div>

        {/* Upload Section */}
        <div id="upload-section" className="mx-auto mb-12 max-w-4xl">
          <FileUpload
            onFileLoaded={onFileLoaded}
            onDataLoaded={onDataLoaded}
            csvSettings={csvSettings}
            currentFileName={currentFileName}
            onClear={onClearFile}
          />

          {/* Sample Data Loader */}
          <div className="animate-fade-in mt-6 flex items-center justify-center gap-3">
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Or try a sample:
            </span>
            <div className="relative">
              <button
                onClick={onToggleSampleDropdown}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-all"
                style={{
                  border: "1px solid var(--border-glass)",
                  background: "var(--bg-glass)",
                  color: "var(--text-secondary)",
                }}
              >
                <Database className="h-4 w-4" />
                Load Sample Data
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showSampleDropdown ? "rotate-180" : ""}`}
                />
              </button>

              {/* Dropdown */}
              {showSampleDropdown && (
                <div
                  className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl shadow-xl"
                  style={{
                    border: "1px solid var(--border-glass)",
                    background: "var(--bg-dropdown)",
                  }}
                >
                  <div className="py-1">
                    {SAMPLE_DATASETS.map((dataset) => (
                      <button
                        key={dataset.id}
                        onClick={() => onLoadSample(dataset.id)}
                        className="w-full px-4 py-3 text-left text-sm transition-colors hover:bg-violet-500/10"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {dataset.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
