"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2, Check, BarChart3, MessageSquare, Send, RefreshCw, Settings2, X } from "lucide-react";
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

const AGGREGATION_TYPES: { id: AggregationType; name: string; description: string }[] = [
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
  disabled = false,
}: ChartSuggestionsProps) {
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

  // Sync with external suggestions
  useEffect(() => {
    if (externalSuggestions) {
      setSuggestions(externalSuggestions);
      // Auto-select ALL valid charts
      const validCharts = externalSuggestions.filter(chart => {
        const hasValidX = data.headers.includes(chart.xAxis);
        const hasValidY = data.headers.includes(chart.yAxis);
        return hasValidX && hasValidY;
      });
      setSelectedCharts(new Set(validCharts.map((c) => c.id)));
    }
  }, [externalSuggestions, data.headers]);

  // Auto-apply charts whenever selection or suggestions change
  useEffect(() => {
    if (suggestions.length > 0) {
      const selected = suggestions.filter((s) => selectedCharts.has(s.id));
      onChartsGenerated(selected);
    }
  }, [selectedCharts, suggestions, onChartsGenerated]);

  const getConfig = (): AIServiceConfig | null => {
    if (!apiSettings?.apiKey) return null;
    return {
      apiKey: apiSettings.apiKey,
      model: apiSettings.model,
      language: apiSettings.language,
    };
  };

  const handleGenerate = async () => {
    const config = getConfig();
    if (!config) {
      setError("Please configure your API key first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const dataSummary = generateDataSummary(data);
      const charts = await generateChartSuggestions(config, dataSummary, data.headers);

      // Filter out charts with invalid columns
      const validCharts = charts.filter(chart => {
        const hasValidX = data.headers.includes(chart.xAxis);
        const hasValidY = data.headers.includes(chart.yAxis);
        return hasValidX && hasValidY;
      });

      setSuggestions(validCharts);
      // Auto-select all valid charts
      setSelectedCharts(new Set(validCharts.map((c) => c.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generating charts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomChart = async () => {
    if (!customPrompt.trim()) return;

    const config = getConfig();
    if (!config) {
      setError("Please configure your API key first");
      return;
    }

    setIsCustomLoading(true);
    setError(null);

    try {
      const dataSummary = generateDataSummary(data);
      const chart = await generateCustomChart(config, dataSummary, customPrompt, data.headers);

      if (chart) {
        // Validate columns
        const hasValidX = data.headers.includes(chart.xAxis);
        const hasValidY = data.headers.includes(chart.yAxis);

        if (hasValidX && hasValidY) {
          setSuggestions((prev) => [...prev, chart]);
          setSelectedCharts((prev) => new Set([...prev, chart.id]));
          setCustomPrompt("");
          setShowCustomInput(false);
        } else {
          setError(`Invalid columns. Available: ${data.headers.join(", ")}`);
        }
      } else {
        setError("Could not generate chart from your description");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generating custom chart");
    } finally {
      setIsCustomLoading(false);
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
      return;
    }

    // For count aggregation, yColumn can be same as xColumn
    const yColumn = manualConfig.aggregation === "count" 
      ? (manualConfig.yColumn || manualConfig.xColumn)
      : manualConfig.yColumn;

    if (!yColumn) {
      setError("Please select a Y column");
      return;
    }

    const newChart: ChartSuggestion = {
      id: `chart-manual-${Date.now()}`,
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

    // Add to suggestions and select it (auto-apply via useEffect)
    setSuggestions((prev) => [...prev, newChart]);
    setSelectedCharts((prev) => new Set([...prev, newChart.id]));
    
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
    <div className="glass-card p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30">
            <Sparkles className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">AI Chart Suggestions</h3>
            <p className="text-sm text-gray-400">
              Let AI suggest the best charts for your data
            </p>
          </div>
        </div>

        {suggestions.length === 0 && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={disabled || isLoading || !apiSettings?.apiKey}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4" />
                Generate Charts
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!apiSettings?.apiKey && (
        <div className="text-center py-6">
          <p className="text-gray-400">
            Configure your API key to generate AI-powered chart suggestions
          </p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`
                  p-4 rounded-xl border transition-all duration-200 relative
                  ${selectedCharts.has(suggestion.id)
                    ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                  }
                `}
              >
                <button
                  type="button"
                  onClick={() => toggleChart(suggestion.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{CHART_ICONS[suggestion.type] ?? "📊"}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-white">{suggestion.title}</h4>
                        {selectedCharts.has(suggestion.id) && (
                          <Check className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {suggestion.description}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">
                          {suggestion.type}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">
                          X: {suggestion.xAxis}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">
                          Y: {suggestion.yAxis}
                        </span>
                        {suggestion.aggregation && suggestion.aggregation !== "none" && (
                          <span className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
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
                  className="absolute top-2 right-2 p-1 rounded-lg hover:bg-white/10 text-gray-500 hover:text-red-400 transition-colors"
                  title="Remove chart"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Custom Chart Input */}
          {showCustomInput ? (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <MessageSquare className="w-5 h-5 text-violet-400" />
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
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
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
              <p className="text-xs text-gray-500 mt-2">
                Available columns: {data.headers.join(", ")}
              </p>
            </div>
          ) : showManualCreate ? (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Settings2 className="w-5 h-5 text-cyan-400" />
                  <h4 className="font-medium text-white">Create Chart Manually</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManualCreate(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Chart Title */}
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">Chart Title *</label>
                  <input
                    type="text"
                    value={manualConfig.title}
                    onChange={(e) => setManualConfig((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Sales by Region"
                    className="input-field w-full"
                  />
                </div>

                {/* Chart Type */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Chart Type</label>
                  <select
                    value={manualConfig.type}
                    onChange={(e) => setManualConfig((prev) => ({ ...prev, type: e.target.value as ChartType }))}
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
                  <label className="block text-sm text-gray-400 mb-1">Aggregation</label>
                  <select
                    value={manualConfig.aggregation}
                    onChange={(e) => setManualConfig((prev) => ({ ...prev, aggregation: e.target.value as AggregationType }))}
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
                  <label className="block text-sm text-gray-400 mb-1">X Axis (Categories) *</label>
                  <select
                    value={manualConfig.xColumn}
                    onChange={(e) => setManualConfig((prev) => ({ ...prev, xColumn: e.target.value }))}
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
                  <label className="block text-sm text-gray-400 mb-1">
                    Y Axis (Values) {manualConfig.aggregation !== "count" && "*"}
                  </label>
                  <select
                    value={manualConfig.yColumn}
                    onChange={(e) => setManualConfig((prev) => ({ ...prev, yColumn: e.target.value }))}
                    className="input-field w-full"
                  >
                    <option value="">
                      {manualConfig.aggregation === "count" ? "(Optional for count)" : "Select column..."}
                    </option>
                    {data.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                  {manualConfig.aggregation === "count" && (
                    <p className="text-xs text-gray-500 mt-1">
                      Optional: leave empty to count occurrences of X values
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4">
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
                  disabled={!manualConfig.title.trim() || !manualConfig.xColumn || (manualConfig.aggregation !== "count" && !manualConfig.yColumn)}
                  className="btn-primary disabled:opacity-50"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Create Chart
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="flex-1 p-4 rounded-xl border border-dashed border-white/20 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all flex items-center justify-center gap-2 text-gray-400 hover:text-violet-400"
              >
                <MessageSquare className="w-4 h-4" />
                AI Chart from description
              </button>
              <button
                type="button"
                onClick={() => setShowManualCreate(true)}
                className="flex-1 p-4 rounded-xl border border-dashed border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all flex items-center justify-center gap-2 text-gray-400 hover:text-cyan-400"
              >
                <Settings2 className="w-4 h-4" />
                Manual column selection
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={disabled || isLoading}
              className="btn-secondary text-sm inline-flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Regenerate
                </>
              )}
            </button>
            <span className="text-sm text-gray-400">
              {selectedCharts.size} chart{selectedCharts.size !== 1 ? "s" : ""} selected
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
