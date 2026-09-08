"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Brain,
  Loader2,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Download,
  BarChart3,
  FileDown,
} from "lucide-react";
import {
  type CSVData,
  generateDataSummary as generateCSVSummary,
} from "~/lib/csv-parser";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  generateDataSummary,
  detectAnomalies,
  streamCustomAnalysis,
  generateCustomChart,
  fetchSuggestedQuestions,
  type DataSummaryResult,
  type AnomalyResult,
  type AIServiceConfig,
  type SuggestedQuestion,
} from "~/lib/ai-service";
import type { StoredSettings } from "~/lib/storage";
import { useChatStore } from "~/lib/chat-store";
import { ChartDisplay } from "./ChartDisplay";
import { useRequestScope } from "~/lib/use-request-scope";

interface AIAnalysisProps {
  data: CSVData;
  fileName?: string;
  apiSettings: StoredSettings | null;
  externalSummary?: DataSummaryResult | null;
  externalAnomalies?: AnomalyResult[] | null;
  externalSummaryError?: string | null;
  externalAnomaliesError?: string | null;
  disabled?: boolean;
  onSummaryChange?: (
    result: DataSummaryResult | null,
    error: string | null,
  ) => void;
  onAnomaliesChange?: (
    result: AnomalyResult[] | null,
    error: string | null,
  ) => void;
}

const SEVERITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function AIAnalysis({
  data,
  fileName,
  apiSettings,
  externalSummary,
  externalAnomalies,
  externalSummaryError,
  externalAnomaliesError,
  disabled = false,
  onSummaryChange,
  onAnomaliesChange,
}: AIAnalysisProps) {
  const requests = useRequestScope(data, apiSettings);
  // Independent loading states for each analysis type
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingAnomalies, setIsLoadingAnomalies] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [anomaliesError, setAnomaliesError] = useState<string | null>(null);

  // Summary state
  const [summaryResult, setSummaryResult] = useState<DataSummaryResult | null>(
    null,
  );

  // Anomalies state
  const [anomaliesResult, setAnomaliesResult] = useState<
    AnomalyResult[] | null
  >(null);

  // Custom analysis state and active tab - using global store to persist across fullscreen toggle
  const {
    history: customHistory,
    streamingResponse,
    currentPrompt: customPrompt,
    activeTab,
    isLoading: isLoadingCustom,
    pendingPrompt,
    addMessage,
    updateMessageAt,
    setStreaming,
    appendStreaming,
    setPrompt: setCustomPrompt,
    setActiveTab,
    setLoading: setLoadingCustom,
    clearChat,
  } = useChatStore();
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Suggested questions state
  const [suggestedQuestions, setSuggestedQuestions] = useState<
    SuggestedQuestion[]
  >([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const suggestionsLoadedRef = useRef(false);

  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    insights: true,
    quality: true,
  });

  useEffect(
    () => () => {
      ["summary-toast", "anomalies-toast", "custom-query-toast"].forEach((id) =>
        toast.dismiss(id),
      );
    },
    [requests],
  );

  useEffect(() => {
    if (disabled) {
      requests.cancelAll();
      setIsLoadingSummary(false);
      setIsLoadingAnomalies(false);
      setLoadingCustom(false);
      setStreaming("");
    }
  }, [disabled, requests, setLoadingCustom, setStreaming]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [customHistory, streamingResponse, expandedSections.custom]);

  // Reset suggested questions when data changes (new file loaded)
  useEffect(() => {
    suggestionsLoadedRef.current = false;
    setSuggestedQuestions([]);
  }, [data]);

  // Sync with external results
  useEffect(() => {
    if (externalSummary) {
      setSummaryResult(externalSummary);
    }
  }, [externalSummary]);

  useEffect(() => {
    if (externalAnomalies) {
      setAnomaliesResult(externalAnomalies);
    }
  }, [externalAnomalies]);

  // Compute effective errors: use external error (from page.tsx "Run All") if available,
  // otherwise fall back to local error (from individual button clicks)
  const effectiveSummaryError = externalSummaryError || summaryError;
  const effectiveAnomaliesError = externalAnomaliesError || anomaliesError;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleCopy = useCallback(async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleExportReport = useCallback(() => {
    const sections: string[] = [];
    sections.push("# AI Analysis Report\n");

    if (summaryResult) {
      sections.push("## Dataset Description\n");
      sections.push(summaryResult.summary + "\n");

      if (summaryResult.keyInsights?.length) {
        sections.push("## Key Insights\n");
        summaryResult.keyInsights.forEach((insight) => {
          sections.push(`- ${insight}`);
        });
        sections.push("");
      }

      if (summaryResult.dataQuality) {
        sections.push("## Data Quality\n");
        sections.push(summaryResult.dataQuality + "\n");
      }
    }

    if (anomaliesResult && anomaliesResult.length > 0) {
      sections.push("## Anomalies Detected\n");
      sections.push(`| Row | Column | Value | Issue | Severity |`);
      sections.push(`|-----|--------|-------|-------|----------|`);
      anomaliesResult.forEach((a) => {
        sections.push(
          `| ${a.row} | ${a.column} | ${a.value} | ${a.issue} | ${a.severity} |`,
        );
      });
      sections.push("");
    }

    if (customHistory.length > 0) {
      sections.push("## Chat History\n");
      customHistory.forEach((item) => {
        sections.push(`### Q: ${item.prompt}\n`);
        sections.push(item.response + "\n");
      });
    }

    const markdown = sections.join("\n");
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-analysis-report.md";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported as Markdown");
  }, [summaryResult, anomaliesResult, customHistory]);

  const handleExportPDF = useCallback(async () => {
    try {
      const { exportToPDF } = await import("~/lib/pdf-export");
      exportToPDF({
        fileName: fileName ?? "analysis",
        data,
        summary: summaryResult,
        anomalies: anomaliesResult,
        chatHistory: customHistory,
      });
      toast.success("PDF report exported");
    } catch (e) {
      console.error("PDF export failed:", e);
      toast.error("PDF export failed");
    }
  }, [fileName, data, summaryResult, anomaliesResult, customHistory]);

  const getConfig = (action: string): AIServiceConfig | null => {
    // Allow custom endpoint without API key
    const hasValidConfig = apiSettings?.customEndpoint
      ? !!apiSettings.customModel
      : !!apiSettings?.apiKey;
    if (!hasValidConfig) return null;
    return {
      signal: requests.start(action),
      apiKey: apiSettings!.apiKey,
      model: apiSettings!.model,
      providerId: apiSettings!.providerId,
      providerNpm: apiSettings!.providerNpm,
      providerApi: apiSettings!.providerApi,
      language: apiSettings!.language,
      customEndpoint: apiSettings!.customEndpoint,
      customModel: apiSettings!.customModel,
    };
  };

  // Auto-fetch suggested questions when custom tab is first shown
  useEffect(() => {
    if (
      activeTab !== "custom" ||
      suggestionsLoadedRef.current ||
      customHistory.length > 0 ||
      isLoadingSuggestions
    )
      return;

    const config = getConfig("suggestions");
    if (!config) return;

    suggestionsLoadedRef.current = true;
    setIsLoadingSuggestions(true);

    // Guard against stale responses when data changes mid-flight
    let cancelled = false;
    const csvSummary = generateCSVSummary(data);
    void fetchSuggestedQuestions(config, csvSummary)
      .then((questions) => {
        if (!cancelled) setSuggestedQuestions(questions);
      })
      .catch(() => {
        // Non-critical — silently ignore
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSuggestions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, data, apiSettings]);

  const handleGenerateSummary = async () => {
    const config = getConfig("summary");
    if (!config) {
      setSummaryError("Please configure your API settings");
      toast.error("Configuration Required", {
        description: "Please configure your API settings",
      });
      return;
    }

    onSummaryChange?.(summaryResult, null);
    setIsLoadingSummary(true);
    setSummaryError(null);
    toast.loading("Generating Summary", {
      description: "Analyzing your data...",
      id: "summary-toast",
    });

    try {
      const csvSummary = generateCSVSummary(data);
      const result = await generateDataSummary(config, csvSummary);
      setSummaryResult(result);
      onSummaryChange?.(result, null);
      setSummaryError(null);
      toast.success("Summary Generated", {
        description: "Data summary is ready!",
        id: "summary-toast",
      });
    } catch (err) {
      if (config.signal?.aborted) return;
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unable to analyze data. Please try again.";
      setSummaryError(errorMessage);
      onSummaryChange?.(null, errorMessage);
      console.error("Data summary failed:", err);
      toast.error("Summary Failed", {
        description: errorMessage,
        id: "summary-toast",
      });
    } finally {
      if (!config.signal?.aborted) setIsLoadingSummary(false);
    }
  };

  const handleDetectAnomalies = async () => {
    const config = getConfig("anomalies");
    if (!config) {
      setAnomaliesError("Please configure your API settings");
      toast.error("Configuration Required", {
        description: "Please configure your API settings",
      });
      return;
    }

    onAnomaliesChange?.(anomaliesResult, null);
    setIsLoadingAnomalies(true);
    setAnomaliesError(null);
    toast.loading("Detecting Anomalies", {
      description: "Scanning your data for anomalies...",
      id: "anomalies-toast",
    });

    try {
      const csvSummary = generateCSVSummary(data);

      const result = await detectAnomalies(config, csvSummary, data);
      setAnomaliesResult(result);
      onAnomaliesChange?.(result, null);
      setAnomaliesError(null);
      toast.success("Anomalies Detected", {
        description: `Found ${result.length} potential anomal${result.length === 1 ? "y" : "ies"}`,
        id: "anomalies-toast",
      });
    } catch (err) {
      if (config.signal?.aborted) return;
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unable to detect anomalies. Please try again.";
      setAnomaliesError(errorMessage);
      onAnomaliesChange?.(null, errorMessage);
      console.error("Anomaly detection failed:", err);
      toast.error("Detection Failed", {
        description: errorMessage,
        id: "anomalies-toast",
      });
    } finally {
      if (!config.signal?.aborted) setIsLoadingAnomalies(false);
    }
  };

  const handleCustomAnalysis = async () => {
    if (!customPrompt.trim()) return;

    const config = getConfig("chat");
    if (!config) {
      setError("Please configure your API settings");
      toast.error("Configuration Required", {
        description: "Please configure your API settings",
      });
      return;
    }

    const currentPrompt = customPrompt;
    setLoadingCustom(true, currentPrompt);
    setStreaming("");
    setCustomPrompt("");
    toast.loading("Processing Query", {
      description: "AI is analyzing your request...",
      id: "custom-query-toast",
    });

    try {
      const csvSummary = generateCSVSummary(data);

      await streamCustomAnalysis(
        config,
        currentPrompt,
        csvSummary,
        // onChunk - called for each text chunk
        (chunk) => {
          appendStreaming(chunk);
        },
        // onComplete - called when streaming is done
        (fullText) => {
          // Add message immediately
          addMessage({ prompt: currentPrompt, response: fullText });
          // Capture the index of the message we just added (it's the last one right now)
          const messageIndex = customHistory.length; // history before addMessage had this length, so new msg is at this index
          setStreaming("");
          setLoadingCustom(false);
          toast.success("Query Complete", {
            description: "AI has finished analyzing your request",
            id: "custom-query-toast",
          });

          // Try to generate a chart if the query seems chart-related (async, non-blocking)
          const chartKeywords =
            /chart|graph|plot|visuali[sz]e|trend|distribution|histogram|pie|bar|scatter|compare/i;
          if (chartKeywords.test(currentPrompt)) {
            void generateCustomChart(
              config,
              csvSummary,
              currentPrompt,
              data.headers,
            )
              .then((result) => {
                if (result && !config.signal?.aborted) {
                  updateMessageAt(messageIndex, { chart: result });
                }
              })
              .catch(() => {
                // Chart generation is optional — silently ignore
              });
          }
        },
        customHistory, // Pass current history
      );
    } catch (err) {
      if (config.signal?.aborted) return;
      let errorMessage = "Unable to analyze. Please try again.";
      if (err instanceof Error && err.message && err.message.trim() !== "") {
        errorMessage = err.message;
      } else if (typeof err === "string" && err.trim() !== "") {
        errorMessage = err;
      }

      const errorResponse = `[ERROR] ${errorMessage}`;
      // Add error directly to history and stop loading
      addMessage({
        prompt: currentPrompt,
        response: errorResponse,
      });
      setStreaming("");
      setLoadingCustom(false);
      toast.error("Query Failed", {
        description: errorMessage,
        id: "custom-query-toast",
      });
    }
  };

  const tabs = [
    { id: "summary" as const, label: "Summary", icon: FileText },
    { id: "anomalies" as const, label: "Anomalies", icon: AlertTriangle },
    { id: "custom" as const, label: "Custom Query", icon: MessageSquare },
  ];

  return (
    <div className="glass-card animate-fade-in flex flex-1 flex-col p-6">
      {(isLoadingSummary || isLoadingAnomalies || isLoadingCustom) && (
        <button
          type="button"
          onClick={() => {
            requests.cancelAll();
            setIsLoadingSummary(false);
            setIsLoadingAnomalies(false);
            setLoadingCustom(false);
            setStreaming("");
            setIsLoadingSuggestions(false);
            ["summary-toast", "anomalies-toast", "custom-query-toast"].forEach(
              (id) => toast.dismiss(id),
            );
          }}
          className="mb-4 self-start rounded-lg border border-white/20 px-3 py-2 text-sm"
        >
          Stop analysis
        </button>
      )}
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <div className="rounded-xl border border-emerald-500/30 bg-linear-to-br from-emerald-500/20 to-teal-500/20 p-3">
          <Brain className="h-6 w-6 text-emerald-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">AI Analysis</h3>
          <p className="text-sm text-gray-400">
            Get intelligent insights about your data
          </p>
        </div>
        {(summaryResult || anomaliesResult || customHistory.length > 0) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportPDF}
              className="flex items-center gap-2 rounded-lg bg-violet-500/10 px-3 py-2 text-sm text-violet-400 transition-colors hover:bg-violet-500/20 hover:text-violet-300"
              title="Export full report as PDF"
            >
              <FileDown className="h-4 w-4" />
              PDF
            </button>
            <button
              type="button"
              onClick={handleExportReport}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              title="Export report as Markdown"
            >
              <Download className="h-4 w-4" />
              MD
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-white/10 pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-all ${
              activeTab === tab.id
                ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            } `}
          >
            <tab.icon className="h-4 w-4" />
            <span className="text-sm font-medium">{tab.label}</span>
            {/* Show an error badge on the tab if the corresponding analysis has an error */}
            {tab.id === "summary" && effectiveSummaryError && (
              <span
                className="ml-1 inline-flex h-2 w-2 rounded-full bg-red-500"
                aria-label="Error"
              />
            )}
            {tab.id === "anomalies" && effectiveAnomaliesError && (
              <span
                className="ml-1 inline-flex h-2 w-2 rounded-full bg-red-500"
                aria-label="Error"
              />
            )}
          </button>
        ))}
      </div>

      {/* Global error for config issues */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* No API Key Warning */}
      {!apiSettings?.apiKey && !apiSettings?.customEndpoint && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-400">
            Configure your API key or custom endpoint to use AI analysis
          </p>
        </div>
      )}

      {/* Tab Content */}
      <div className="min-h-[200px] flex-1 overflow-y-auto" aria-live="polite">
        {/* Summary Tab */}
        {activeTab === "summary" && (
          <div className="space-y-4">
            {effectiveSummaryError && (
              <div className="animate-fade-in rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div className="flex-1">
                    <p className="mb-1 text-sm font-medium text-red-400">
                      Error generating summary
                    </p>
                    <p className="text-sm text-red-300/80">
                      {effectiveSummaryError}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {!summaryResult ? (
              <div className="py-8 text-center">
                <p className="mb-4 text-gray-400">
                  AI will analyze your data and generate a complete summary
                </p>
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={
                    disabled ||
                    isLoadingSummary ||
                    (!apiSettings?.apiKey && !apiSettings?.customEndpoint)
                  }
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoadingSummary ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4" />
                      Generate Summary
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h4 className="mb-2 flex items-center gap-2 font-medium text-white">
                    <FileText className="h-4 w-4 text-emerald-400" />
                    Dataset Description
                  </h4>
                  <MarkdownRenderer content={summaryResult.summary} />
                </div>

                {/* Key Insights */}
                {summaryResult.keyInsights &&
                  summaryResult.keyInsights.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <button
                        type="button"
                        onClick={() => toggleSection("insights")}
                        className="mb-2 flex w-full items-center justify-between"
                      >
                        <h4 className="flex items-center gap-2 font-medium text-white">
                          <Lightbulb className="h-4 w-4 text-yellow-400" />
                          Key Insights ({summaryResult.keyInsights.length})
                        </h4>
                        {expandedSections.insights ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                      {expandedSections.insights && (
                        <ul className="space-y-2">
                          {summaryResult.keyInsights.map((insight, i) => (
                            <li
                              key={`insight-${i}`}
                              className="flex items-start gap-2 text-gray-300"
                            >
                              <span className="mt-1 text-emerald-400">•</span>
                              <MarkdownRenderer content={insight} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                {/* Data Quality */}
                {summaryResult.dataQuality && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <button
                      type="button"
                      onClick={() => toggleSection("quality")}
                      className="mb-2 flex w-full items-center justify-between"
                    >
                      <h4 className="flex items-center gap-2 font-medium text-white">
                        <CheckCircle2 className="h-4 w-4 text-blue-400" />
                        Data Quality
                      </h4>
                      {expandedSections.quality ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                    {expandedSections.quality && (
                      <MarkdownRenderer content={summaryResult.dataQuality} />
                    )}
                  </div>
                )}

                {/* Regenerate Button */}
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={disabled || isLoadingSummary}
                  className="btn-secondary inline-flex items-center gap-2 text-sm"
                >
                  {isLoadingSummary ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Regenerate Analysis
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Anomalies Tab */}
        {activeTab === "anomalies" && (
          <div className="space-y-4">
            {effectiveAnomaliesError && (
              <div className="animate-fade-in rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div className="flex-1">
                    <p className="mb-1 text-sm font-medium text-red-400">
                      Error detecting anomalies
                    </p>
                    <p className="text-sm text-red-300/80">
                      {effectiveAnomaliesError}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {!anomaliesResult ? (
              <div className="py-8 text-center">
                <p className="mb-4 text-gray-400">
                  AI will scan your data to detect anomalies
                </p>
                <button
                  type="button"
                  onClick={handleDetectAnomalies}
                  disabled={
                    disabled ||
                    isLoadingAnomalies ||
                    (!apiSettings?.apiKey && !apiSettings?.customEndpoint)
                  }
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoadingAnomalies ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Detecting...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4" />
                      Detect Anomalies
                    </>
                  )}
                </button>
              </div>
            ) : anomaliesResult.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mb-4 inline-block rounded-full bg-green-500/20 p-4">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <p className="mb-2 text-gray-300">No anomalies detected</p>
                <p className="text-sm text-gray-500">
                  Your data appears to be valid and consistent
                </p>
                <button
                  type="button"
                  onClick={handleDetectAnomalies}
                  disabled={disabled || isLoadingAnomalies}
                  className="btn-secondary mt-4 inline-flex items-center gap-2 text-sm"
                >
                  {isLoadingAnomalies ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Run Again
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-gray-400">
                    <span className="font-medium text-white">
                      {anomaliesResult.length}
                    </span>{" "}
                    anomal{anomaliesResult.length > 1 ? "ies" : "y"} detected
                  </p>
                  <button
                    type="button"
                    onClick={handleDetectAnomalies}
                    disabled={disabled || isLoadingAnomalies}
                    className="btn-secondary inline-flex items-center gap-2 text-sm"
                  >
                    {isLoadingAnomalies ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Run Again
                  </button>
                </div>

                <ol
                  aria-label="Detected anomalies"
                  tabIndex={0}
                  className="max-h-[min(60vh,36rem)] space-y-4 overflow-y-auto overscroll-contain rounded-xl pr-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                >
                  {anomaliesResult.map((anomaly, i) => (
                    <li
                      key={`anomaly-${i}`}
                      className="anomaly-card min-w-0 rounded-xl border p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="shrink-0 text-sm text-(--text-secondary) tabular-nums">
                            Row {anomaly.row}
                          </span>
                          <h4 className="min-w-0 text-base font-semibold wrap-anywhere">
                            {anomaly.column}
                          </h4>
                        </div>
                        <span
                          data-severity={anomaly.severity}
                          className="anomaly-severity inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
                        >
                          <AlertTriangle
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                          {SEVERITY_LABELS[anomaly.severity]}
                        </span>
                      </div>
                      <p className="mt-3 max-w-[75ch] text-base leading-relaxed wrap-anywhere">
                        {anomaly.issue}
                      </p>
                      <dl className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                        <dt className="text-(--text-secondary)">Value:</dt>
                        <dd className="min-w-0 rounded-md bg-(--bg-input) px-2 py-1 font-mono wrap-anywhere">
                          {anomaly.value || "(empty)"}
                        </dd>
                      </dl>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Custom Analysis Tab */}
        {activeTab === "custom" && (
          <div className="space-y-4">
            {/* Clear chat button */}
            {customHistory.length > 0 && !isLoadingCustom && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    requests.cancelAll();
                    clearChat();
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Clear chat history"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
              </div>
            )}

            {/* History */}
            {(customHistory.length > 0 || isLoadingCustom) && (
              <div
                ref={chatContainerRef}
                className="mb-4 max-h-[400px] space-y-4 overflow-y-auto scroll-smooth pr-2"
              >
                {customHistory.map((item, i) => {
                  const isError = item.response.startsWith("[ERROR]");
                  return (
                    <div key={`history-${i}`} className="space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-violet-500/20 p-2">
                          <MessageSquare className="h-4 w-4 text-violet-400" />
                        </div>
                        <div className="flex-1 rounded-xl border border-violet-500/20 bg-violet-500/10 p-3">
                          <p className="text-sm text-gray-300">{item.prompt}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div
                          className={`rounded-lg p-2 ${isError ? "bg-red-500/20" : "bg-emerald-500/20"}`}
                        >
                          {isError ? (
                            <AlertTriangle className="h-4 w-4 text-red-400" />
                          ) : (
                            <Brain className="h-4 w-4 text-emerald-400" />
                          )}
                        </div>
                        <div
                          className={`group/msg relative flex-1 rounded-xl p-3 ${
                            isError
                              ? "border border-red-500/30 bg-red-500/10"
                              : "border border-white/10 bg-white/5"
                          }`}
                        >
                          {!isError && (
                            <button
                              type="button"
                              onClick={() => void handleCopy(item.response, i)}
                              className="absolute top-2 right-2 rounded-md bg-white/5 p-1.5 text-gray-500 opacity-0 transition-opacity group-hover/msg:opacity-100 hover:bg-white/10 hover:text-white"
                              title="Copy to clipboard"
                            >
                              {copiedIndex === i ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          {isError ? (
                            <p className="text-sm whitespace-pre-wrap text-red-300">
                              {item.response}
                            </p>
                          ) : (
                            <MarkdownRenderer
                              content={item.response}
                              className="text-sm"
                            />
                          )}
                          {item.chart && (
                            <div className="mt-3 border-t border-white/10 pt-3">
                              <div className="mb-2 flex items-center gap-1.5 text-xs text-violet-400">
                                <BarChart3 className="h-3.5 w-3.5" />
                                Generated chart
                              </div>
                              <ChartDisplay data={data} charts={[item.chart]} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Streaming response - shown while generating */}
                {isLoadingCustom && (
                  <div className="space-y-2">
                    {/* Show the pending prompt */}
                    {pendingPrompt && (
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-violet-500/20 p-2">
                          <MessageSquare className="h-4 w-4 text-violet-400" />
                        </div>
                        <div className="flex-1 rounded-xl border border-violet-500/20 bg-violet-500/10 p-3">
                          <p className="text-sm text-gray-300">
                            {pendingPrompt}
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Show the streaming response */}
                    <div className="flex items-start gap-3">
                      {streamingResponse.startsWith("[ERROR]") ? (
                        <div className="rounded-lg bg-red-500/20 p-2">
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                        </div>
                      ) : (
                        <div className="rounded-lg bg-emerald-500/20 p-2">
                          <Brain className="h-4 w-4 animate-pulse text-emerald-400" />
                        </div>
                      )}
                      <div
                        className={`flex-1 rounded-xl p-3 ${
                          streamingResponse.startsWith("[ERROR]")
                            ? "border border-red-500/30 bg-red-500/10"
                            : "border border-emerald-500/30 bg-white/5"
                        }`}
                      >
                        {streamingResponse.startsWith("[ERROR]") ? (
                          <p className="text-sm whitespace-pre-wrap text-red-300">
                            {streamingResponse}
                          </p>
                        ) : streamingResponse ? (
                          <MarkdownRenderer
                            content={streamingResponse}
                            className="text-sm"
                            isStreaming
                          />
                        ) : (
                          <p className="text-sm text-gray-300">Analyzing...</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input */}
            <div className="flex gap-3">
              <label htmlFor="custom-query-input" className="sr-only">
                Ask a question about your data
              </label>
              <input
                id="custom-query-input"
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleCustomAnalysis();
                  }
                }}
                placeholder="Ask a question about your data..."
                className="input-field flex-1"
                disabled={
                  disabled ||
                  isLoadingCustom ||
                  (!apiSettings?.apiKey && !apiSettings?.customEndpoint)
                }
              />
              <button
                type="button"
                onClick={handleCustomAnalysis}
                disabled={
                  disabled ||
                  isLoadingCustom ||
                  !customPrompt.trim() ||
                  (!apiSettings?.apiKey && !apiSettings?.customEndpoint)
                }
                className="btn-primary px-4 disabled:opacity-50"
                aria-label="Send question"
              >
                {isLoadingCustom ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>

            {customHistory.length === 0 && !isLoadingCustom && (
              <div className="py-4 text-center">
                {isLoadingSuggestions ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading suggested questions...
                  </div>
                ) : suggestedQuestions.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                      Try one of these questions:
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {suggestedQuestions.map((q, i) => (
                        <button
                          key={`suggestion-${i}`}
                          type="button"
                          onClick={() => {
                            setCustomPrompt(q.question);
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-white"
                        >
                          {q.question}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Ask any question about your data. For example:
                    <br />
                    <span className="text-gray-400">
                      &quot;What is the sales trend?&quot;
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
