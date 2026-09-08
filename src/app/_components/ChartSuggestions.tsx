"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Check,
  BarChart3,
  MessageSquare,
  Send,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { useRequestScope } from "~/lib/use-request-scope";
import { validateChart } from "~/lib/chart-validation";
import { type CSVData, generateDataSummary } from "~/lib/csv-parser";
import {
  generateChartSuggestions,
  generateCustomChart,
  type ChartSuggestion,
  type AIServiceConfig,
  type ChartType,
  type AggregationType,
} from "~/lib/ai-service";
import type { StoredSettings } from "~/lib/storage";

interface ChartSuggestionsProps {
  data: CSVData;
  apiSettings: StoredSettings | null;
  onChartsGenerated: (charts: ChartSuggestion[]) => void;
  externalSuggestions?: ChartSuggestion[] | null;
  externalError?: string | null;
  disabled?: boolean;
}

const CHART_ICONS: Record<string, string> = {
  bar: "📊",
  line: "📈",
  pie: "🥧",
  scatter: "🔵",
  area: "📉",
};

const CHART_TYPES: { id: ChartType; name: string; icon: string }[] = [
  { id: "bar", name: "Bar Chart", icon: "📊" },
  { id: "line", name: "Line Chart", icon: "📈" },
  { id: "pie", name: "Pie Chart", icon: "🥧" },
  { id: "scatter", name: "Scatter Plot", icon: "🔵" },
  { id: "area", name: "Area Chart", icon: "📉" },
];

const AGGREGATION_TYPES: {
  id: AggregationType;
  name: string;
  description: string;
}[] = [
  { id: "none", name: "None", description: "Raw values" },
  { id: "sum", name: "Sum", description: "Total" },
  { id: "avg", name: "Average", description: "Mean value" },
  { id: "count", name: "Count", description: "Number of items" },
  { id: "min", name: "Min", description: "Minimum value" },
  { id: "max", name: "Max", description: "Maximum value" },
];

interface ManualChartConfig {
  type: ChartType;
  title: string;
  xColumn: string;
  yColumn: string;
  aggregation: AggregationType;
}

export function ChartSuggestions({
  data,
  apiSettings,
  onChartsGenerated,
  externalSuggestions,
  externalError,
  disabled = false,
}: ChartSuggestionsProps) {
  const requests = useRequestScope(data, apiSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [isCustomLoading, setIsCustomLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ChartSuggestion[]>([]);
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(new Set());
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [manualConfig, setManualConfig] = useState<ManualChartConfig>({
    type: "bar",
    title: "",
    xColumn: "",
    yColumn: "",
    aggregation: "sum",
  });

  useEffect(
    () => () => {
      toast.dismiss("chart-gen-toast");
      toast.dismiss("custom-chart-toast");
    },
    [requests],
  );

  useEffect(() => {
    if (disabled) {
      requests.cancelAll();
      setIsLoading(false);
      setIsCustomLoading(false);
    }
  }, [disabled, requests]);

  const previousData = useRef(data);
  // Reset only for a different dataset, including after Suspense reconnects.
  useEffect(() => {
    if (previousData.current === data) return;
    previousData.current = data;
    setSuggestions([]);
    setSelectedCharts(new Set());
    setError(null);
    setShowCustomInput(false);
    setShowManualCreate(false);
    setCustomPrompt("");
  }, [data]);

  // Sync with external suggestions
  useEffect(() => {
    if (externalSuggestions) {
      setSuggestions(externalSuggestions);
      // Auto-select ALL valid charts
      const validCharts = externalSuggestions.filter((chart) => {
        const hasValidX = data.headers.includes(chart.xAxis);
        const hasValidY = data.headers.includes(chart.yAxis);
        return hasValidX && hasValidY;
      });
      setSelectedCharts(new Set(validCharts.map((c) => c.id)));
    }
  }, [externalSuggestions, data.headers]);

  // Compute effective error: use external error (from page.tsx "Run All") if available,
  // otherwise fall back to local error (from individual button clicks)
  const effectiveError = externalError || error;

  // Auto-apply charts whenever selection or suggestions change
  useEffect(() => {
    const selected = suggestions.filter((s) => selectedCharts.has(s.id));
    onChartsGenerated(selected);
  }, [selectedCharts, suggestions, onChartsGenerated]);

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

  const handleGenerate = async () => {
    const config = getConfig("charts");
    if (!config) {
      setError("Please configure your API settings first");
      toast.error("Configuration Required", {
        description: "Please configure your API settings first",
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    toast.loading("Generating Charts", {
      description: "AI is creating chart suggestions...",
      id: "chart-gen-toast",
    });

    try {
      const dataSummary = generateDataSummary(data);
      const charts = await generateChartSuggestions(
        config,
        dataSummary,
        data.headers,
      );

      // Filter out charts with invalid columns
      const validCharts = charts.filter((chart) => {
        const hasValidX = data.headers.includes(chart.xAxis);
        const hasValidY = data.headers.includes(chart.yAxis);
        return hasValidX && hasValidY;
      });

      setSuggestions(validCharts);
      // Auto-select all valid charts
      setSelectedCharts(new Set(validCharts.map((c) => c.id)));
      toast.success("Charts Generated", {
        description: `Created ${validCharts.length} chart suggestion${validCharts.length === 1 ? "" : "s"}`,
        id: "chart-gen-toast",
      });
    } catch (err) {
      if (config.signal?.aborted) return;
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unable to generate charts. Please try again.";
      setError(errorMessage);
      console.error("Chart generation failed:", err);
      toast.error("Generation Failed", {
        description: errorMessage,
        id: "chart-gen-toast",
      });
    } finally {
      if (!config.signal?.aborted) setIsLoading(false);
    }
  };

  const handleCustomChart = async () => {
    if (!customPrompt.trim()) return;

    const config = getConfig("custom");
    if (!config) {
      setError("Please configure your API settings first");
      toast.error("Configuration Required", {
        description: "Please configure your API settings first",
      });
      return;
    }

    setIsCustomLoading(true);
    setError(null);
    toast.loading("Creating Custom Chart", {
      description: "Generating chart from your description...",
      id: "custom-chart-toast",
    });

    try {
      const dataSummary = generateDataSummary(data);
      const chart = await generateCustomChart(
        config,
        dataSummary,
        customPrompt,
        data.headers,
      );

      if (chart) {
        // Validate columns
        const hasValidX = data.headers.includes(chart.xAxis);
        const hasValidY = data.headers.includes(chart.yAxis);

        if (hasValidX && hasValidY) {
          setSuggestions((prev) => [...prev, chart]);
          setSelectedCharts((prev) => new Set([...prev, chart.id]));
          setCustomPrompt("");
          setShowCustomInput(false);
          toast.success("Custom Chart Created", {
            description: chart.title,
            id: "custom-chart-toast",
          });
        } else {
          setError(`Invalid columns. Available: ${data.headers.join(", ")}`);
          toast.error("Invalid Columns", {
            description: "Chart uses columns not in your data",
            id: "custom-chart-toast",
          });
        }
      } else {
        const errMsg =
          "Could not generate chart from your description. Please try rephrasing your request.";
        setError(errMsg);
        toast.error("Chart Creation Failed", {
          description: errMsg,
          id: "custom-chart-toast",
        });
      }
    } catch (err) {
      if (config.signal?.aborted) return;
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unable to generate custom chart. Please try again.";
      setError(errorMessage);
      console.error("Custom chart generation failed:", err);
      toast.error("Generation Error", {
        description: errorMessage,
        id: "custom-chart-toast",
      });
    } finally {
      if (!config.signal?.aborted) setIsCustomLoading(false);
    }
  };

  const toggleChart = (chartId: string) => {
    setSelectedCharts((prev) => {
      const next = new Set(prev);
      if (next.has(chartId)) {
        next.delete(chartId);
      } else {
        next.add(chartId);
      }
      return next;
    });
  };

  const removeChart = (chartId: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== chartId));
    setSelectedCharts((prev) => {
      const next = new Set(prev);
      next.delete(chartId);
      return next;
    });
  };

  const handleManualCreate = () => {
    if (!manualConfig.title.trim() || !manualConfig.xColumn) {
      setError("Please fill in all required fields");
      toast.error("Missing Fields", {
        description: "Please fill in all required fields",
      });
      return;
    }

    // For count aggregation, yColumn can be same as xColumn
    const yColumn =
      manualConfig.aggregation === "count"
        ? manualConfig.yColumn || manualConfig.xColumn
        : manualConfig.yColumn;

    if (!yColumn) {
      setError("Please select a Y column");
      toast.error("Missing Y Column", {
        description: "Please select a Y column",
      });
      return;
    }

    const newChart: ChartSuggestion = {
      id: `chart-manual-${crypto.randomUUID()}`,
      type: manualConfig.type,
      title: manualConfig.title,
      description: `${manualConfig.type} chart showing ${yColumn} by ${manualConfig.xColumn}`,
      xAxis: manualConfig.xColumn,
      yAxis: yColumn,
      aggregation: manualConfig.aggregation,
      dataConfig: {
        xColumn: manualConfig.xColumn,
        yColumn: yColumn,
      },
    };

    const validationError = validateChart(data, newChart);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    // Add to suggestions and select it (auto-apply via useEffect)
    setSuggestions((prev) => [...prev, newChart]);
    setSelectedCharts((prev) => new Set([...prev, newChart.id]));

    toast.success("Chart Created", {
      description: manualConfig.title,
    });

    setShowManualCreate(false);
    setManualConfig({
      type: "bar",
      title: "",
      xColumn: "",
      yColumn: "",
      aggregation: "sum",
    });
  };

  return (
    <div className="glass-card animate-fade-in flex flex-1 flex-col p-6">
      {(isLoading || isCustomLoading) && (
        <button
          type="button"
          onClick={() => {
            requests.cancelAll();
            setIsLoading(false);
            setIsCustomLoading(false);
            toast.dismiss("chart-gen-toast");
            toast.dismiss("custom-chart-toast");
          }}
          className="mb-4 self-start rounded-lg border border-white/20 px-3 py-2 text-sm"
        >
          Stop chart generation
        </button>
      )}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-amber-500/30 bg-linear-to-br from-amber-500/20 to-orange-500/20 p-3">
            <Sparkles className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <div>
                <h3 className="font-semibold text-white">
                  AI Chart Suggestions
                </h3>
                <p className="text-sm text-gray-400">
                  Let AI suggest the best charts for your data
                </p>
              </div>
              {/* Show an inline error indicator when chart generation had an error */}
              {effectiveError && (
                <div className="ml-2 inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-sm">
                  <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-xs text-red-300">Error</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {suggestions.length === 0 && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={
              disabled ||
              isLoading ||
              (!apiSettings?.apiKey && !apiSettings?.customEndpoint)
            }
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <BarChart3 className="h-4 w-4" />
                Generate Charts
              </>
            )}
          </button>
        )}
      </div>

      {effectiveError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div className="flex-1">
              <p className="mb-1 text-sm font-medium text-red-400">
                Error generating charts
              </p>
              <p className="text-sm text-red-300/80">{effectiveError}</p>
            </div>
          </div>
        </div>
      )}

      {!apiSettings?.apiKey && !apiSettings?.customEndpoint && (
        <div className="py-6 text-center">
          <p className="text-gray-400">
            Configure your API key or custom endpoint to generate AI-powered
            chart suggestions
          </p>
        </div>
      )}

      <div className="space-y-4">
        {suggestions.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`relative rounded-xl border p-4 transition-all duration-200 ${
                  selectedCharts.has(suggestion.id)
                    ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                } `}
              >
                <button
                  type="button"
                  onClick={() => toggleChart(suggestion.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">
                      {CHART_ICONS[suggestion.type] ?? "📊"}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-white">
                          {suggestion.title}
                        </h4>
                        {selectedCharts.has(suggestion.id) && (
                          <Check className="h-4 w-4 text-amber-400" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-400">
                        {suggestion.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300">
                          {suggestion.type}
                        </span>
                        <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300">
                          X: {suggestion.xAxis}
                        </span>
                        <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300">
                          Y: {suggestion.yAxis}
                        </span>
                        {suggestion.aggregation &&
                          suggestion.aggregation !== "none" && (
                            <span className="rounded bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">
                              {suggestion.aggregation}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                </button>
                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeChart(suggestion.id)}
                  className="absolute top-2 right-2 rounded-lg p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-red-400"
                  title="Remove chart"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Custom Chart Input */}
        {showCustomInput ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-violet-400" />
              <h4 className="font-medium text-white">Describe your chart</h4>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleCustomChart();
                  }
                }}
                placeholder="e.g., Bar chart showing sales by region..."
                className="input-field flex-1"
                disabled={isCustomLoading}
              />
              <button
                type="button"
                onClick={handleCustomChart}
                disabled={isCustomLoading || !customPrompt.trim()}
                className="btn-primary px-4 disabled:opacity-50"
              >
                {isCustomLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomPrompt("");
                }}
                className="btn-secondary px-4"
              >
                Cancel
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Available columns: {data.headers.join(", ")}
            </p>
          </div>
        ) : showManualCreate ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings2 className="h-5 w-5 text-cyan-400" />
                <h4 className="font-medium text-white">
                  Create Chart Manually
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowManualCreate(false)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Chart Title */}
              <div className="md:col-span-2">
                <label
                  htmlFor="manual-title"
                  className="mb-1 block text-sm text-gray-400"
                >
                  Chart Title *
                </label>
                <input
                  type="text"
                  id="manual-title"
                  value={manualConfig.title}
                  onChange={(e) =>
                    setManualConfig((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  placeholder="e.g., Sales by Region"
                  className="input-field w-full"
                />
              </div>

              {/* Chart Type */}
              <div>
                <label
                  htmlFor="manual-type"
                  className="mb-1 block text-sm text-gray-400"
                >
                  Chart Type
                </label>
                <select
                  id="manual-type"
                  value={manualConfig.type}
                  onChange={(e) =>
                    setManualConfig((prev) => ({
                      ...prev,
                      type: e.target.value as ChartType,
                    }))
                  }
                  className="input-field w-full"
                >
                  {CHART_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.icon} {type.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Aggregation */}
              <div>
                <label
                  htmlFor="manual-aggregation"
                  className="mb-1 block text-sm text-gray-400"
                >
                  Aggregation
                </label>
                <select
                  id="manual-aggregation"
                  value={manualConfig.aggregation}
                  onChange={(e) =>
                    setManualConfig((prev) => ({
                      ...prev,
                      aggregation: e.target.value as AggregationType,
                    }))
                  }
                  className="input-field w-full"
                >
                  {AGGREGATION_TYPES.map((agg) => (
                    <option key={agg.id} value={agg.id}>
                      {agg.name} - {agg.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* X Column */}
              <div>
                <label
                  htmlFor="manual-x"
                  className="mb-1 block text-sm text-gray-400"
                >
                  X Axis (Categories) *
                </label>
                <select
                  id="manual-x"
                  value={manualConfig.xColumn}
                  onChange={(e) =>
                    setManualConfig((prev) => ({
                      ...prev,
                      xColumn: e.target.value,
                    }))
                  }
                  className="input-field w-full"
                >
                  <option value="">Select column...</option>
                  {data.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              {/* Y Column */}
              <div>
                <label
                  htmlFor="manual-y"
                  className="mb-1 block text-sm text-gray-400"
                >
                  Y Axis (Values) {manualConfig.aggregation !== "count" && "*"}
                </label>
                <select
                  id="manual-y"
                  value={manualConfig.yColumn}
                  onChange={(e) =>
                    setManualConfig((prev) => ({
                      ...prev,
                      yColumn: e.target.value,
                    }))
                  }
                  className="input-field w-full"
                >
                  <option value="">
                    {manualConfig.aggregation === "count"
                      ? "(Optional for count)"
                      : "Select column..."}
                  </option>
                  {data.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
                {manualConfig.aggregation === "count" && (
                  <p className="mt-1 text-xs text-gray-500">
                    Optional: leave empty to count occurrences of X values
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowManualCreate(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualCreate}
                disabled={
                  !manualConfig.title.trim() ||
                  !manualConfig.xColumn ||
                  (manualConfig.aggregation !== "count" &&
                    !manualConfig.yColumn)
                }
                className="btn-primary disabled:opacity-50"
              >
                <Check className="mr-2 h-4 w-4" />
                Create Chart
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              disabled={
                disabled ||
                (!apiSettings?.apiKey && !apiSettings?.customEndpoint)
              }
              onClick={() => setShowCustomInput(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 p-4 text-gray-400 transition-all hover:border-violet-500/50 hover:bg-violet-500/5 hover:text-violet-400"
            >
              <MessageSquare className="h-4 w-4" />
              AI Chart from description
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowManualCreate(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 p-4 text-gray-400 transition-all hover:border-cyan-500/50 hover:bg-cyan-500/5 hover:text-cyan-400"
            >
              <Settings2 className="h-4 w-4" />
              Manual column selection
            </button>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={
              disabled ||
              isLoading ||
              (!apiSettings?.apiKey && !apiSettings?.customEndpoint)
            }
            className="btn-secondary inline-flex items-center gap-2 text-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </>
            )}
          </button>
          <span className="text-sm text-gray-400">
            {selectedCharts.size} chart{selectedCharts.size !== 1 ? "s" : ""}{" "}
            selected
          </span>
        </div>
      </div>
    </div>
  );
}
