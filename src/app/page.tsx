"use client";

import { useState, useEffect } from "react";
import { FileUpload } from "~/app/_components/FileUpload";
import { DataTable } from "./_components/DataTable";
import { FullscreenCard } from "./_components/FullscreenCard";
import { ChartSuggestions } from "~/app/_components/ChartSuggestions";
import { ChartDisplay } from "~/app/_components/ChartDisplay";
import { APIKeyButton } from "~/app/_components/APIKeySettings";
import { CSVSettingsButton } from "~/app/_components/CSVSettings";
import { AIAnalysis } from "~/app/_components/AIAnalysis";
import { ClientOnly } from "./_components/ClientOnly";
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
import { SAMPLE_DATASETS, generateDatasetById } from "~/lib/sample-data";
import { Sparkles, Play, Loader2, Database, ChevronDown } from "lucide-react";


export default function HomePage() {
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | undefined>(undefined);
  const [csvSettings, setCsvSettings] = useState<CSVSettings>(DEFAULT_CSV_SETTINGS);
  const [apiSettings, setApiSettings] = useState<StoredSettings | null>(null);
  const [generatedCharts, setGeneratedCharts] = useState<ChartSuggestion[]>([]);

  // Sample data dropdown
  const [showSampleDropdown, setShowSampleDropdown] = useState(false);

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

  useEffect(() => {
    const settings = loadApiSettings();
    if (settings) {
      setApiSettings(settings);
    }
  }, []);

  const handleFileLoaded = (content: string, fileName: string) => {
    const data = parseCSV(content, csvSettings);
    setCsvData(data);
    setCurrentFileName(fileName);
    setGeneratedCharts([]);
    setAnalysisResults({ summary: null, anomalies: null, charts: null });
  };

  const handleClearFile = () => {
    setCsvData(null);
    setCurrentFileName(undefined);
    setGeneratedCharts([]);
    setAnalysisResults({ summary: null, anomalies: null, charts: null });
  };

  const handleLoadSample = (datasetId: string) => {
    const dataset = generateDatasetById(datasetId);
    if (!dataset) return;

    // Convert to CSVData format
    const data: CSVData = {
      headers: dataset.headers,
      rows: dataset.rows,
      columns: dataset.headers.map((name, index) => ({
        name,
        type: "string" as const,
        index,
      })),
      rowCount: dataset.rows.length,
    };

    setCsvData(data);
    setCurrentFileName(dataset.name);
    setGeneratedCharts([]);
    setAnalysisResults({ summary: null, anomalies: null, charts: null });
    setShowSampleDropdown(false);
  };

  const handleRunAllAnalysis = async () => {
    if (!csvData || !apiSettings?.apiKey) return;

    setIsAnalyzingAll(true);
    // Reset results before starting
    setAnalysisResults({ summary: null, anomalies: null, charts: null });
    setGeneratedCharts([]);

    const config = {
      apiKey: apiSettings.apiKey,
      model: apiSettings.model,
      language: apiSettings.language,
    };

    const csvSummary = generateCSVSummary(csvData);

    // Prepare anomaly detection sample
    const headers = csvData.headers.join(",");
    const rows = csvData.rows
      .slice(0, 50)
      .map((row) => row.join(","))
      .join("\n");
    const sampleCSV = `${headers}\n${rows}`;

    // Run all in parallel but update UI as each completes
    const summaryPromise = generateDataSummary(config, csvSummary)
      .then((summary) => {
        setAnalysisResults((prev) => ({ ...prev, summary }));
        return summary;
      })
      .catch((error) => {
        console.error("Summary failed:", error);
        return null;
      });

    const anomaliesPromise = detectAnomalies(config, csvSummary, sampleCSV)
      .then((anomalies) => {
        setAnalysisResults((prev) => ({ ...prev, anomalies }));
        return anomalies;
      })
      .catch((error) => {
        console.error("Anomalies failed:", error);
        return null;
      });

    const chartsPromise = generateChartSuggestions(config, csvSummary, csvData.headers)
      .then((charts) => {
        setAnalysisResults((prev) => ({ ...prev, charts }));
        // Auto-generate all suggested charts
        if (charts && charts.length > 0) {
          const validCharts = charts.filter(chart => {
            const hasValidX = csvData.headers.includes(chart.xAxis);
            const hasValidY = csvData.headers.includes(chart.yAxis);
            return hasValidX && hasValidY;
          });
          setGeneratedCharts(validCharts);
        }
        return charts;
      })
      .catch((error) => {
        console.error("Charts failed:", error);
        return null;
      });

    // Wait for all to complete before removing loading state
    await Promise.all([summaryPromise, anomaliesPromise, chartsPromise]);
    setIsAnalyzingAll(false);
  };

  const handleRegenerateChart = async (failedChart: ChartSuggestion) => {
    if (!csvData || !apiSettings?.apiKey) return;

    const config = {
      apiKey: apiSettings.apiKey,
      model: apiSettings.model,
      language: apiSettings.language,
    };

    try {
      const repairedChart = await repairChartSuggestion(
        config,
        failedChart,
        csvData.headers,
        "Failed to render chart with current configuration"
      );

      if (repairedChart) {
        setGeneratedCharts((prev) =>
          prev.map((c) => (c.id === failedChart.id ? repairedChart : c))
        );
      } else {
        alert("Could not repair this chart automatically.");
      }
    } catch (error) {
      console.error("Failed to regenerate chart", error);
      alert("Failed to regenerate chart");
    }
  };

  return (
    <ClientOnly fallback={
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-black text-white p-4 md:p-8">
        <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </main>
    }>
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-black text-white p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                  CSV AI Analyzer
                </h1>
                <p className="text-gray-400">
                  Intelligent data analysis powered by AI
                </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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

        {/* File Upload & Sample Data */}
        <div className="space-y-4">
          <FileUpload
            onFileLoaded={handleFileLoaded}
            currentFileName={currentFileName}
            onClear={handleClearFile}
          />

          {/* Sample Data Loader */}
          {!csvData && (
            <div className="flex items-center justify-center gap-3 animate-fade-in">
              <span className="text-sm text-gray-500">Or try a sample:</span>
              <div className="relative">
                <button
                  onClick={() => setShowSampleDropdown(!showSampleDropdown)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm text-gray-300"
                >
                  <Database className="w-4 h-4" />
                  Load Sample Data
                  <ChevronDown className={`w-4 h-4 transition-transform ${showSampleDropdown ? "rotate-180" : ""}`} />
                </button>

                {/* Dropdown */}
                {showSampleDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-20">
                    <div className="py-1">
                      {SAMPLE_DATASETS.map((dataset) => (
                        <button
                          key={dataset.id}
                          onClick={() => handleLoadSample(dataset.id)}
                          className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          {dataset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {csvData && (
          <div className="space-y-8 animate-slide-up">
            {/* Run Complete Analysis Button */}
            <div className="flex justify-center">
              <button
                onClick={handleRunAllAnalysis}
                disabled={isAnalyzingAll || !apiSettings?.apiKey}
                className={`
                    group relative px-8 py-4 rounded-2xl font-bold text-lg shadow-2xl transition-all duration-300
                    ${!apiSettings?.apiKey
                    ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 hover:scale-105 hover:shadow-violet-500/40 text-white"
                  }
                  `}
              >
                {isAnalyzingAll ? (
                  <span className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Running Full Analysis...
                  </span>
                ) : (
                  <span className="flex items-center gap-3">
                    <Sparkles className="w-6 h-6 animate-pulse" />
                    Run Complete Analysis
                    <Play className="w-5 h-5 fill-current opacity-80" />
                  </span>
                )}

                {/* Glow effect */}
                {!isAnalyzingAll && apiSettings?.apiKey && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 blur-xl opacity-40 group-hover:opacity-60 transition-opacity -z-10" />
                )}
              </button>
            </div>

            {!apiSettings?.apiKey && (
              <p className="text-center text-amber-400 text-sm">
                Please configure your API key to enable AI analysis
              </p>
            )}

            {/* Full-width Cards Stack */}
            <div className="space-y-8">
              {/* Data Table - Full Width */}
              <FullscreenCard className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden">
                <DataTable data={csvData} />
              </FullscreenCard>

              {/* AI Analysis - Full Width */}
              <FullscreenCard className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden">
                <AIAnalysis
                  data={csvData}
                  apiSettings={apiSettings}
                  externalSummary={analysisResults.summary}
                  externalAnomalies={analysisResults.anomalies}
                  disabled={isAnalyzingAll}
                />
              </FullscreenCard>

              {/* Chart Suggestions - Full Width */}
              <FullscreenCard className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden">
                <ChartSuggestions
                  data={csvData}
                  apiSettings={apiSettings}
                  onChartsGenerated={setGeneratedCharts}
                  externalSuggestions={analysisResults.charts}
                  disabled={isAnalyzingAll}
                />
              </FullscreenCard>

              {generatedCharts && generatedCharts.length > 0 && (
                <FullscreenCard className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden">
                  <ChartDisplay
                    data={csvData}
                    charts={generatedCharts}
                    onRegenerate={handleRegenerateChart}
                  />
                </FullscreenCard>
              )}
            </div>
          </div>
        )}
        </div>
      </main>
    </ClientOnly>
  );
}
