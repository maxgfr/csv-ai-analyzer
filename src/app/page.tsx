"use client";

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { toast } from "sonner";
import { DataTable } from "./_components/DataTable";
import { FullscreenCard } from "./_components/FullscreenCard";
const ChartDisplay = lazy(() =>
  import("./_components/ChartDisplay").then((m) => ({
    default: m.ChartDisplay,
  })),
);
import { APIKeyButton } from "~/app/_components/APIKeySettings";
import { CSVSettingsButton } from "~/app/_components/CSVSettings";
import { ClientOnly } from "./_components/ClientOnly";
import { ThemeToggle } from "./_components/ThemeToggle";
import { LandingPage } from "./_components/landing/LandingPage";

// Lazy-load heavy components to reduce initial bundle size
const ChartSuggestions = lazy(() =>
  import("~/app/_components/ChartSuggestions").then((m) => ({
    default: m.ChartSuggestions,
  })),
);
const AIAnalysis = lazy(() =>
  import("~/app/_components/AIAnalysis").then((m) => ({
    default: m.AIAnalysis,
  })),
);
const CSVCompare = lazy(() =>
  import("~/app/_components/CSVCompare").then((m) => ({
    default: m.CSVCompare,
  })),
);
const DataTransform = lazy(() =>
  import("~/app/_components/DataTransform").then((m) => ({
    default: m.DataTransform,
  })),
);
import {
  type CSVData,
  type CSVSettings,
  DEFAULT_CSV_SETTINGS,
  parseCSV,
  generateDataSummary as generateCSVSummary,
} from "~/lib/csv-parser";
import {
  type ChartSuggestion,
  type DataSummaryResult,
  type AnomalyResult,
  generateDataSummary,
  detectAnomalies,
  generateChartSuggestions,
  repairChartSuggestion,
} from "~/lib/ai-service";
import { loadApiSettings, type StoredSettings } from "~/lib/storage";
import { clearChatStore, getChatStore } from "~/lib/chat-store";
import { Sparkles, Loader2, ArrowLeft, FileDown } from "lucide-react";
import { useRequestScope } from "~/lib/use-request-scope";
import type { ImportSource } from "~/lib/data-tasks";
import { FileUpload } from "./_components/FileUpload";
import { DataQuality } from "./_components/DataQuality";

export default function HomePage() {
  const [sourceVersion, setSourceVersion] = useState(0);
  const [source, setSource] = useState<ImportSource>();
  const [showImport, setShowImport] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [isTransforming, setIsTransforming] = useState(false);
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | undefined>(
    undefined,
  );
  const [csvSettings, setCsvSettings] =
    useState<CSVSettings>(DEFAULT_CSV_SETTINGS);
  const [apiSettings, setApiSettings] = useState<StoredSettings | null>(null);
  const [generatedCharts, setGeneratedCharts] = useState<ChartSuggestion[]>([]);
  const [workingData, setWorkingData] = useState<CSVData | null>(null);

  // Parallel Analysis State
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<{
    summary: DataSummaryResult | null;
    anomalies: AnomalyResult[] | null;
    charts: ChartSuggestion[] | null;
  }>({
    summary: null,
    anomalies: null,
    charts: null,
  });
  const [chartGenerationError, setChartGenerationError] = useState<
    string | null
  >(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [anomaliesError, setAnomaliesError] = useState<string | null>(null);

  useEffect(() => {
    const settings = loadApiSettings();
    if (settings) {
      setApiSettings(settings);
    }
  }, []);

  // Data used for analysis — transformed data if available, otherwise raw
  const effectiveData = workingData ?? csvData;
  const requests = useRequestScope(effectiveData, apiSettings);
  const invalidate = useCallback(() => {
    requests.cancelAll();
    setIsAnalyzingAll(false);
    setGeneratedCharts([]);
    setAnalysisResults({ summary: null, anomalies: null, charts: null });
    setSummaryError(null);
    setAnomaliesError(null);
    setChartGenerationError(null);
    clearChatStore();
    setDataVersion((v) => v + 1);
    toast.dismiss("analysis-toast");
  }, [requests]);
  useEffect(() => {
    if (isTransforming) invalidate();
  }, [isTransforming]);
  const handleTransformed = useCallback((next: CSVData | null) => {
    setWorkingData((previous) => (previous === next ? previous : next));
  }, []);
  useEffect(() => {
    invalidate();
  }, [effectiveData, apiSettings]);

  const handleFileLoaded = (content: string, fileName: string) => {
    const data = parseCSV(content, csvSettings);
    setSourceVersion((v) => v + 1);
    setCsvData(data);
    setCurrentFileName(fileName);
    setWorkingData(null);
    setGeneratedCharts([]);
    setAnalysisResults({ summary: null, anomalies: null, charts: null });
    setChartGenerationError(null);
    setSummaryError(null);
    setAnomaliesError(null);
    clearChatStore();
    toast.success("File Loaded", {
      description: `${fileName} loaded successfully with ${data.rows.length} rows`,
    });
  };

  const handleClearFile = () => {
    requests.cancelAll();
    setSource(undefined);
    setShowImport(false);
    setCsvData(null);
    setCurrentFileName(undefined);
    setWorkingData(null);
    setGeneratedCharts([]);
    setAnalysisResults({ summary: null, anomalies: null, charts: null });
    setChartGenerationError(null);
    setSummaryError(null);
    setAnomaliesError(null);
    clearChatStore();
    toast.info("File Cleared", {
      description: "Ready to upload a new file",
    });
  };

  const handleDataLoaded = (
    data: CSVData,
    fileName: string,
    imported?: ImportSource,
  ) => {
    requests.cancelAll();
    setSource(imported);
    setShowImport(false);
    if (imported) setCsvSettings(imported.settings);
    setSourceVersion((v) => v + 1);
    setCsvData(data);
    setCurrentFileName(fileName);
    setWorkingData(null);
    setGeneratedCharts([]);
    setAnalysisResults({ summary: null, anomalies: null, charts: null });
    setChartGenerationError(null);
    setSummaryError(null);
    setAnomaliesError(null);
    clearChatStore();
    toast.success("Data Loaded", {
      description: `${fileName} loaded with ${data.rows.length} rows`,
    });
  };

  const hasValidConfig = apiSettings?.customEndpoint
    ? !!apiSettings.customModel
    : !!apiSettings?.apiKey;

  const handleRunAllAnalysis = async () => {
    const analysisData = effectiveData ?? csvData;
    if (!analysisData || !hasValidConfig) return;

    const signal = requests.start("all");
    setIsAnalyzingAll(true);
    setAnalysisResults({ summary: null, anomalies: null, charts: null });
    setGeneratedCharts([]);
    setSummaryError(null);
    setAnomaliesError(null);
    setChartGenerationError(null);
    toast.loading("Starting Analysis", {
      description: "Running complete analysis on your data...",
      id: "analysis-toast",
    });

    const config = {
      signal,
      apiKey: apiSettings!.apiKey,
      model: apiSettings!.model,
      providerId: apiSettings!.providerId,
      providerNpm: apiSettings!.providerNpm,
      providerApi: apiSettings!.providerApi,
      language: apiSettings!.language,
      customEndpoint: apiSettings!.customEndpoint,
      customModel: apiSettings!.customModel,
    };

    const csvSummary = generateCSVSummary(analysisData);

    const summaryPromise = generateDataSummary(config, csvSummary)
      .then((summary) => {
        if (signal.aborted) return null;
        setSummaryError(null);
        setAnalysisResults((prev) => ({ ...prev, summary }));
        return summary;
      })
      .catch((error: unknown) => {
        if (signal.aborted) return null;
        let errorMessage = "Unable to generate summary. Please try again.";
        if (
          error instanceof Error &&
          error.message &&
          error.message.trim() !== ""
        ) {
          errorMessage = error.message;
        } else if (typeof error === "string" && error.trim() !== "") {
          errorMessage = error;
        }

        toast.error("Summary Failed", {
          description: errorMessage,
          id: "summary-error",
        });
        setSummaryError(errorMessage);
        return null;
      });

    const anomaliesPromise = detectAnomalies(config, csvSummary, analysisData)
      .then((anomalies) => {
        if (signal.aborted) return null;
        setAnomaliesError(null);
        setAnalysisResults((prev) => ({ ...prev, anomalies }));
        return anomalies;
      })
      .catch((error: unknown) => {
        if (signal.aborted) return null;
        let errorMessage = "Unable to detect anomalies. Please try again.";
        if (
          error instanceof Error &&
          error.message &&
          error.message.trim() !== ""
        ) {
          errorMessage = error.message;
        } else if (typeof error === "string" && error.trim() !== "") {
          errorMessage = error;
        }

        toast.error("Anomalies Failed", {
          description: errorMessage,
          id: "anomalies-error",
        });
        setAnomaliesError(errorMessage);
        return null;
      });

    const chartsPromise = generateChartSuggestions(
      config,
      csvSummary,
      analysisData.headers,
    )
      .then((charts) => {
        if (signal.aborted) return null;
        setChartGenerationError(null);
        setAnalysisResults((prev) => ({ ...prev, charts }));
        if (charts && charts.length > 0) {
          const validCharts = charts.filter((chart) => {
            const hasValidX = analysisData.headers.includes(chart.xAxis);
            const hasValidY = analysisData.headers.includes(chart.yAxis);
            return hasValidX && hasValidY;
          });
          setGeneratedCharts(validCharts);
        }
        return charts;
      })
      .catch((error: unknown) => {
        if (signal.aborted) return null;
        let errorMessage = "Unable to generate charts. Please try again.";
        if (
          error instanceof Error &&
          error.message &&
          error.message.trim() !== ""
        ) {
          errorMessage = error.message;
        } else if (typeof error === "string" && error.trim() !== "") {
          errorMessage = error;
        }

        toast.error("Chart Generation Failed", {
          description: errorMessage,
          id: "charts-error",
        });
        setChartGenerationError(errorMessage);
        return null;
      });

    const completed = await Promise.all([
      summaryPromise,
      anomaliesPromise,
      chartsPromise,
    ]);
    if (signal.aborted) return;
    setIsAnalyzingAll(false);

    toast[completed.every((result) => result !== null) ? "success" : "warning"](
      "Analysis Complete",
      {
        description: completed.every((result) => result !== null)
          ? "Your analysis is ready."
          : "Some analyses failed. Retry them individually below.",
        id: "analysis-toast",
      },
    );
  };

  const handleGlobalPDFExport = async () => {
    if (!csvData) return;
    try {
      const { exportToPDF, captureChartImages } =
        await import("~/lib/pdf-export");
      const chatStore = getChatStore();
      // Capture chart images from the DOM if charts are rendered
      const chartImages =
        generatedCharts.length > 0
          ? await captureChartImages(generatedCharts)
          : undefined;
      exportToPDF({
        fileName: currentFileName ?? "analysis",
        data: effectiveData ?? csvData,
        summary: analysisResults.summary,
        anomalies: analysisResults.anomalies,
        chatHistory: chatStore.history,
        charts: generatedCharts.length > 0 ? generatedCharts : undefined,
        chartImages,
      });
      toast.success("PDF report exported");
    } catch (e) {
      console.error("PDF export failed:", e);
      toast.error("PDF export failed");
    }
  };

  const handleRegenerateChart = async (failedChart: ChartSuggestion) => {
    const hasValidCfg = apiSettings?.customEndpoint
      ? !!apiSettings.customModel
      : !!apiSettings?.apiKey;
    if (!csvData || !hasValidCfg) return;

    const signal = requests.start(`repair-${failedChart.id}`);
    const config = {
      signal,
      apiKey: apiSettings!.apiKey,
      model: apiSettings!.model,
      providerId: apiSettings!.providerId,
      providerNpm: apiSettings!.providerNpm,
      providerApi: apiSettings!.providerApi,
      language: apiSettings!.language,
      customEndpoint: apiSettings!.customEndpoint,
      customModel: apiSettings!.customModel,
    };

    try {
      toast.loading("Regenerating Chart", {
        description: "Attempting to fix the chart...",
        id: "regenerate-chart-toast",
      });
      const repairedChart = await repairChartSuggestion(
        config,
        failedChart,
        (effectiveData ?? csvData).headers,
        "Failed to render chart with current configuration",
      );

      if (signal.aborted) return;
      if (repairedChart) {
        setGeneratedCharts((prev) =>
          prev.map((c) => (c.id === failedChart.id ? repairedChart : c)),
        );
        toast.success("Chart Regenerated", {
          description: "The chart has been successfully fixed!",
          id: "regenerate-chart-toast",
        });
      } else {
        toast.error("Regeneration Failed", {
          description: "Could not repair this chart automatically.",
          id: "regenerate-chart-toast",
        });
      }
    } catch (error) {
      if (signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "Failed to regenerate chart";
      toast.error("Regeneration Error", {
        description: message,
        id: "regenerate-chart-toast",
      });
    }
  };

  return (
    <ClientOnly
      fallback={
        <main className="min-h-screen p-4 md:p-8">
          <div className="mx-auto flex min-h-[50vh] max-w-7xl items-center justify-center">
            <div
              className="animate-pulse"
              style={{ color: "var(--text-secondary)" }}
            >
              Loading...
            </div>
          </div>
        </main>
      }
    >
      <main className="min-h-screen">
        {/* Landing Section - Only show when no data */}
        {!csvData && (
          <LandingPage
            csvSettings={csvSettings}
            apiSettings={apiSettings}
            currentFileName={currentFileName}
            onSettingsChange={setCsvSettings}
            onApiSettingsChange={setApiSettings}
            onFileLoaded={handleFileLoaded}
            onClearFile={handleClearFile}
            onDataLoaded={handleDataLoaded}
          />
        )}

        {/* App Section - Show when data is loaded */}
        {csvData && (
          <div className="pb-12">
            {/* Sticky Header Bar */}
            <header
              className="sticky top-0 z-40 border-b backdrop-blur-xl"
              style={{
                borderColor: "var(--border-glass)",
                backgroundColor:
                  "color-mix(in srgb, var(--bg-body-start) 80%, transparent)",
              }}
            >
              <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap md:px-8">
                {/* Left: Back + File info */}
                <button
                  onClick={handleClearFile}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                  title="Load a different file"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-sm font-semibold text-white">
                      {currentFileName}
                    </h1>
                    <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {csvData.rowCount} rows
                    </span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <button
                    disabled={isTransforming}
                    onClick={handleGlobalPDFExport}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-sm text-violet-400 transition-colors hover:bg-violet-500/20 hover:text-violet-300"
                    title="Export full report as PDF"
                  >
                    <FileDown className="h-4 w-4" />
                    <span className="hidden sm:inline">PDF</span>
                  </button>
                  <ThemeToggle />
                  <CSVSettingsButton
                    settings={csvSettings}
                    onSettingsChange={setCsvSettings}
                  />
                  <APIKeyButton
                    onSettingsChange={setApiSettings}
                    currentSettings={apiSettings}
                  />
                </div>
              </div>
            </header>

            {/* Content */}
            <div className="mx-auto max-w-7xl space-y-10 px-4 pt-8 md:px-8">
              {/* ── Data Section ── */}
              <section>
                <SectionLabel label="Data" />
                <div className="space-y-4">
                  {source && (
                    <button
                      type="button"
                      onClick={() => setShowImport((v) => !v)}
                      className="rounded-lg border border-white/20 px-3 py-2 text-sm"
                    >
                      {showImport
                        ? "Close import settings"
                        : "Reimport with different settings"}
                    </button>
                  )}
                  {showImport && source && (
                    <FileUpload
                      initialFile={source.file}
                      csvSettings={csvSettings}
                      onDataLoaded={handleDataLoaded}
                      onClear={() => setShowImport(false)}
                    />
                  )}
                  <DataQuality data={effectiveData ?? csvData} />
                  {/* Data Table - Full width */}
                  <FullscreenCard className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                    <DataTable
                      key={sourceVersion}
                      data={effectiveData ?? csvData}
                    />
                  </FullscreenCard>

                  {/* Data Transform + CSV Compare - Side by side */}
                  <Suspense fallback={<LazyFallback />}>
                    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
                      <FullscreenCard className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                        <DataTransform
                          key={`transform-${sourceVersion}`}
                          data={csvData}
                          onTransformed={handleTransformed}
                          onPendingChange={setIsTransforming}
                        />
                      </FullscreenCard>

                      <FullscreenCard className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                        <CSVCompare
                          key={`compare-${sourceVersion}`}
                          primaryData={csvData}
                          primaryFileName={currentFileName}
                          csvSettings={csvSettings}
                        />
                      </FullscreenCard>
                    </div>
                  </Suspense>
                </div>
              </section>

              {/* ── AI Insights Section ── */}
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase">
                    AI Insights
                  </span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  {isAnalyzingAll && (
                    <button
                      type="button"
                      onClick={() => {
                        requests.cancelAll();
                        setIsAnalyzingAll(false);
                        toast.dismiss("analysis-toast");
                      }}
                      className="rounded-lg border border-white/20 px-3 py-2 text-sm"
                    >
                      Cancel analysis
                    </button>
                  )}
                  <button
                    onClick={handleRunAllAnalysis}
                    disabled={
                      isAnalyzingAll ||
                      isTransforming ||
                      !effectiveData?.rowCount ||
                      !hasValidConfig
                    }
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-lg transition-all duration-200 ${
                      !hasValidConfig
                        ? "cursor-not-allowed bg-gray-800 text-gray-500 shadow-none"
                        : "bg-linear-to-r from-violet-600 to-fuchsia-600 text-white shadow-violet-500/20 hover:shadow-violet-500/40 hover:brightness-110"
                    } disabled:hover:brightness-100`}
                    title={
                      !hasValidConfig
                        ? "Configure your API settings first"
                        : "Run all AI analyses at once"
                    }
                  >
                    {isAnalyzingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Run Complete Analysis
                      </>
                    )}
                  </button>
                </div>
                <Suspense fallback={<LazyFallback />}>
                  <div className="space-y-4">
                    <FullscreenCard className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                      <AIAnalysis
                        key={`analysis-${dataVersion}`}
                        data={effectiveData ?? csvData}
                        fileName={currentFileName}
                        apiSettings={apiSettings}
                        onSummaryChange={(summary, error) => {
                          setAnalysisResults((prev) => ({ ...prev, summary }));
                          setSummaryError(error);
                        }}
                        onAnomaliesChange={(anomalies, error) => {
                          setAnalysisResults((prev) => ({
                            ...prev,
                            anomalies,
                          }));
                          setAnomaliesError(error);
                        }}
                        externalSummary={analysisResults.summary}
                        externalAnomalies={analysisResults.anomalies}
                        externalSummaryError={summaryError}
                        externalAnomaliesError={anomaliesError}
                        disabled={
                          isAnalyzingAll ||
                          isTransforming ||
                          !effectiveData?.rowCount
                        }
                      />
                    </FullscreenCard>

                    <FullscreenCard className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                      <ChartSuggestions
                        key={`charts-${dataVersion}`}
                        data={effectiveData ?? csvData}
                        apiSettings={apiSettings}
                        onChartsGenerated={setGeneratedCharts}
                        externalSuggestions={analysisResults.charts}
                        externalError={chartGenerationError}
                        disabled={
                          isAnalyzingAll ||
                          isTransforming ||
                          !effectiveData?.rowCount
                        }
                      />
                    </FullscreenCard>

                    {generatedCharts && generatedCharts.length > 0 && (
                      <FullscreenCard className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                        <Suspense fallback={<LazyFallback />}>
                          <ChartDisplay
                            data={effectiveData ?? csvData}
                            charts={generatedCharts}
                            fileName={currentFileName}
                            onRegenerate={
                              hasValidConfig ? handleRegenerateChart : undefined
                            }
                          />
                        </Suspense>
                      </FullscreenCard>
                    )}
                  </div>
                </Suspense>
              </section>
            </div>
          </div>
        )}
      </main>
    </ClientOnly>
  );
}

/** Loading placeholder for lazy-loaded components */
function LazyFallback() {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-white/10 bg-slate-900/50">
      <div className="animate-pulse text-sm text-gray-500">Loading...</div>
    </div>
  );
}

/** Subtle section divider with label */
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase">
        {label}
      </span>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}
