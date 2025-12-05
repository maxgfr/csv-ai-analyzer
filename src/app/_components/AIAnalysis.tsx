"use client";

import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { type CSVData, generateDataSummary as generateCSVSummary } from "~/lib/csv-parser";
import {
  generateDataSummary,
  detectAnomalies,
  streamCustomAnalysis,
  type DataSummaryResult,
  type AnomalyResult,
  type AIServiceConfig,
} from "~/lib/ai-service";
import type { StoredSettings } from "~/lib/storage";

interface AIAnalysisProps {
  data: CSVData;
  apiSettings: StoredSettings | null;
  externalSummary?: DataSummaryResult | null;
  externalAnomalies?: AnomalyResult[] | null;
  disabled?: boolean;
}

type AnalysisTab = "summary" | "anomalies" | "custom";

const SEVERITY_COLORS = {
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  high: "bg-red-500/20 text-red-400 border-red-500/30",
};

const SEVERITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function AIAnalysis({
  data,
  apiSettings,
  externalSummary,
  externalAnomalies,
  disabled = false,
}: AIAnalysisProps) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("summary");

  // Independent loading states for each analysis type
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingAnomalies, setIsLoadingAnomalies] = useState(false);
  const [isLoadingCustom, setIsLoadingCustom] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Summary state
  const [summaryResult, setSummaryResult] = useState<DataSummaryResult | null>(null);

  // Anomalies state
  const [anomaliesResult, setAnomaliesResult] = useState<AnomalyResult[] | null>(null);

  // Custom analysis state
  const [customPrompt, setCustomPrompt] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [customHistory, setCustomHistory] = useState<
    Array<{ prompt: string; response: string }>
  >([]);
  const [streamingResponse, setStreamingResponse] = useState<string>("");

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    insights: true,
    quality: true,
  });

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [customHistory, streamingResponse, expandedSections.custom]);

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

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const getConfig = (): AIServiceConfig | null => {
    if (!apiSettings?.apiKey) return null;
    return {
      apiKey: apiSettings.apiKey,
      model: apiSettings.model,
      language: apiSettings.language,
    };
  };

  const handleGenerateSummary = async () => {
    const config = getConfig();
    if (!config) {
      setError("Please configure your API key");
      return;
    }

    setIsLoadingSummary(true);
    setError(null);

    try {
      const csvSummary = generateCSVSummary(data);
      const result = await generateDataSummary(config, csvSummary);
      setSummaryResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error during analysis");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleDetectAnomalies = async () => {
    const config = getConfig();
    if (!config) {
      setError("Please configure your API key");
      return;
    }

    setIsLoadingAnomalies(true);
    setError(null);

    try {
      const csvSummary = generateCSVSummary(data);
      // Get sample rows as CSV string (first 50 rows)
      const headers = data.headers.join(",");
      const rows = data.rows
        .slice(0, 50)
        .map((row) => row.join(","))
        .join("\n");
      const sampleCSV = `${headers}\n${rows}`;

      const result = await detectAnomalies(config, csvSummary, sampleCSV);
      setAnomaliesResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error during detection");
    } finally {
      setIsLoadingAnomalies(false);
    }
  };

  const handleCustomAnalysis = async () => {
    if (!customPrompt.trim()) return;

    const config = getConfig();
    if (!config) {
      setError("Please configure your API key");
      return;
    }

    setIsLoadingCustom(true);
    setError(null);
    setStreamingResponse("");

    const currentPrompt = customPrompt;
    setCustomPrompt("");

    try {
      const csvSummary = generateCSVSummary(data);

      await streamCustomAnalysis(
        config,
        currentPrompt,
        csvSummary,
        // onChunk - called for each text chunk
        (chunk) => {
          setStreamingResponse((prev) => prev + chunk);
        },
        // onComplete - called when streaming is done
        (fullText) => {
          setCustomHistory((prev) => [
            ...prev,
            { prompt: currentPrompt, response: fullText },
          ]);
          setStreamingResponse("");
          setIsLoadingCustom(false);
        },
        customHistory // Pass current history
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error during analysis");
      setStreamingResponse("");
      setIsLoadingCustom(false);
    }
  };

  const tabs = [
    { id: "summary" as const, label: "Summary", icon: FileText },
    { id: "anomalies" as const, label: "Anomalies", icon: AlertTriangle },
    { id: "custom" as const, label: "Custom Query", icon: MessageSquare },
  ];

  return (
    <div className="glass-card p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
          <Brain className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h3 className="font-semibold text-white">AI Analysis</h3>
          <p className="text-sm text-gray-400">
            Get intelligent insights about your data
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-all
              ${activeTab === tab.id
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
              }
            `}
          >
            <tab.icon className="w-4 h-4" />
            <span className="text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* No API Key Warning */}
      {!apiSettings?.apiKey && (
        <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <p className="text-sm text-amber-400">
            Configure your API key to use AI analysis
          </p>
        </div>
      )}

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {/* Summary Tab */}
        {activeTab === "summary" && (
          <div className="space-y-4">
            {!summaryResult ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">
                  AI will analyze your data and generate a complete summary
                </p>
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={disabled || isLoadingSummary || !apiSettings?.apiKey}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoadingSummary ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4" />
                      Generate Summary
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    Dataset Description
                  </h4>
                  <p className="text-gray-300 leading-relaxed">{summaryResult.summary}</p>
                </div>

                {/* Key Insights */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <button
                    type="button"
                    onClick={() => toggleSection("insights")}
                    className="w-full flex items-center justify-between mb-2"
                  >
                    <h4 className="font-medium text-white flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-400" />
                      Key Insights ({summaryResult.keyInsights.length})
                    </h4>
                    {expandedSections.insights ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {expandedSections.insights && (
                    <ul className="space-y-2">
                      {summaryResult.keyInsights.map((insight, i) => (
                        <li
                          key={`insight-${i}`}
                          className="flex items-start gap-2 text-gray-300"
                        >
                          <span className="text-emerald-400 mt-1">•</span>
                          {insight}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Data Quality */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <button
                    type="button"
                    onClick={() => toggleSection("quality")}
                    className="w-full flex items-center justify-between mb-2"
                  >
                    <h4 className="font-medium text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                      Data Quality
                    </h4>
                    {expandedSections.quality ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {expandedSections.quality && (
                    <p className="text-gray-300">{summaryResult.dataQuality}</p>
                  )}
                </div>

                {/* Regenerate Button */}
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={disabled || isLoadingSummary}
                  className="btn-secondary text-sm inline-flex items-center gap-2"
                >
                  {isLoadingSummary ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
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
            {!anomaliesResult ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">
                  AI will scan your data to detect anomalies
                </p>
                <button
                  type="button"
                  onClick={handleDetectAnomalies}
                  disabled={disabled || isLoadingAnomalies || !apiSettings?.apiKey}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoadingAnomalies ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Detecting...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      Detect Anomalies
                    </>
                  )}
                </button>
              </div>
            ) : anomaliesResult.length === 0 ? (
              <div className="text-center py-8">
                <div className="p-4 rounded-full bg-green-500/20 inline-block mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <p className="text-gray-300 mb-2">No anomalies detected</p>
                <p className="text-sm text-gray-500">
                  Your data appears to be valid and consistent
                </p>
                <button
                  type="button"
                  onClick={handleDetectAnomalies}
                  disabled={disabled || isLoadingAnomalies}
                  className="btn-secondary text-sm mt-4 inline-flex items-center gap-2"
                >
                  {isLoadingAnomalies ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Run Again
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-gray-400">
                    <span className="text-white font-medium">
                      {anomaliesResult.length}
                    </span>{" "}
                    anomal{anomaliesResult.length > 1 ? "ies" : "y"} detected
                  </p>
                  <button
                    type="button"
                    onClick={handleDetectAnomalies}
                    disabled={disabled || isLoadingAnomalies}
                    className="btn-secondary text-sm inline-flex items-center gap-2"
                  >
                    {isLoadingAnomalies ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Run Again
                  </button>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {anomaliesResult.map((anomaly, i) => (
                    <div
                      key={`anomaly-${i}`}
                      className={`p-4 rounded-xl border ${SEVERITY_COLORS[anomaly.severity]}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10">
                              Row {anomaly.row}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10">
                              {anomaly.column}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[anomaly.severity]}`}
                            >
                              {SEVERITY_LABELS[anomaly.severity]}
                            </span>
                          </div>
                          <p className="text-sm">{anomaly.issue}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Value: <code className="bg-white/10 px-1 rounded">{anomaly.value}</code>
                          </p>
                        </div>
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Custom Analysis Tab */}
        {activeTab === "custom" && (
          <div className="space-y-4">
            {/* History */}
            {(customHistory.length > 0 || isLoadingCustom) && (
              <div
                ref={chatContainerRef}
                className="space-y-4 max-h-[400px] overflow-y-auto pr-2 mb-4 scroll-smooth"
              >
                {customHistory.map((item, i) => (
                  <div key={`history-${i}`} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-violet-500/20">
                        <MessageSquare className="w-4 h-4 text-violet-400" />
                      </div>
                      <div className="flex-1 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                        <p className="text-sm text-gray-300">{item.prompt}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/20">
                        <Brain className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">
                          {item.response}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Streaming response - shown while generating */}
                {isLoadingCustom && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/20">
                        <Brain className="w-4 h-4 text-emerald-400 animate-pulse" />
                      </div>
                      <div className="flex-1 p-3 rounded-xl bg-white/5 border border-emerald-500/30">
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">
                          {streamingResponse || "Analyzing..."}
                          <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-1" />
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input */}
            <div className="flex gap-3">
              <input
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
                disabled={disabled || isLoadingCustom || !apiSettings?.apiKey}
              />
              <button
                type="button"
                onClick={handleCustomAnalysis}
                disabled={disabled || isLoadingCustom || !customPrompt.trim() || !apiSettings?.apiKey}
                className="btn-primary px-4 disabled:opacity-50"
              >
                {isLoadingCustom ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            {customHistory.length === 0 && !isLoadingCustom && (
              <p className="text-center text-sm text-gray-500 py-4">
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
    </div>
  );
}
