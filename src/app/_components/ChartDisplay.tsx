"use client";

import { useState, useMemo, useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  Brush,
  ReferenceLine,
} from "recharts";
import { RefreshCw, Download, SortAsc, SortDesc, RotateCcw, TrendingUp, Filter } from "lucide-react";
import type { CSVData } from "~/lib/csv-parser";
import type { ChartSuggestion, ChartType } from "~/lib/ai-service";
import { FullscreenCard } from "./FullscreenCard";

const COLORS = [
  "#8b5cf6", // Violet 500
  "#06b6d4", // Cyan 500
  "#f43f5e", // Rose 500
  "#eab308", // Yellow 500
  "#10b981", // Emerald 500
  "#3b82f6", // Blue 500
  "#d946ef", // Fuchsia 500
  "#f97316", // Orange 500
];

interface ChartDisplayProps {
  data: CSVData;
  charts: ChartSuggestion[];
  onRegenerate?: (chart: ChartSuggestion) => Promise<void>;
}

interface SingleChartProps {
  data: CSVData;
  chart: ChartSuggestion;
  onRegenerate?: (chart: ChartSuggestion) => Promise<void>;
}

type SortOrder = "none" | "asc" | "desc";
type ChartDataPoint = Record<string, string | number>;

// Helper function to process chart data - defined outside component
const processChartData = (
  data: CSVData,
  chart: ChartSuggestion,
  sortOrder: SortOrder = "none",
  limit = 20
): ChartDataPoint[] => {
  let result: ChartDataPoint[] = [];

  // Find actual columns (case-insensitive match)
  const xColDef = data.columns.find(c => c.name.toLowerCase() === chart.xAxis.toLowerCase());
  const yColDef = data.columns.find(c => c.name.toLowerCase() === chart.yAxis.toLowerCase());

  if (!xColDef) return [];

  const xCol = xColDef.name;
  const xIdx = xColDef.index;
  
  // For count aggregation, we don't need a valid Y column - we just count occurrences
  const isCountMode = chart.aggregation === "count";
  const yCol = yColDef?.name ?? "count";
  const yIdx = yColDef?.index ?? -1;

  // Grouping logic if needed
  if (chart.aggregation && chart.aggregation !== "none") {
    const groups = new Map<string, { sum: number; count: number; min: number; max: number }>();

    data.rows.forEach(row => {
      const xVal = String(row[xIdx] ?? "").trim();
      if (!xVal) return; // Skip empty X values
      
      // For count mode, we don't need numeric Y values
      if (isCountMode) {
        const current = groups.get(xVal) ?? { sum: 0, count: 0, min: 0, max: 0 };
        groups.set(xVal, {
          ...current,
          count: current.count + 1,
        });
      } else if (yIdx >= 0) {
        const yVal = parseFloat(String(row[yIdx] ?? "0"));
        if (!isNaN(yVal)) {
          const current = groups.get(xVal) ?? { sum: 0, count: 0, min: Infinity, max: -Infinity };
          groups.set(xVal, {
            sum: current.sum + yVal,
            count: current.count + 1,
            min: Math.min(current.min, yVal),
            max: Math.max(current.max, yVal),
          });
        }
      }
    });

    groups.forEach((stats, key) => {
      let value: number;
      switch (chart.aggregation) {
        case "sum":
          value = stats.sum;
          break;
        case "avg":
          value = stats.count > 0 ? stats.sum / stats.count : 0;
          break;
        case "count":
          value = stats.count;
          break;
        case "min":
          value = stats.min === Infinity ? 0 : stats.min;
          break;
        case "max":
          value = stats.max === -Infinity ? 0 : stats.max;
          break;
        default:
          value = stats.sum;
      }
      result.push({ [xCol]: key, [yCol]: Math.round(value * 100) / 100 });
    });
  } else if (yIdx >= 0) {
    // Raw data logic - only if we have a Y column
    result = data.rows.slice(0, Math.min(limit * 2, data.rows.length)).map(row => ({
      [xCol]: row[xIdx] ?? "",
      [yCol]: parseFloat(String(row[yIdx] ?? "0"))
    })).filter(item => !isNaN(item[yCol] as number));
  }

  // Apply sorting
  if (sortOrder !== "none") {
    result.sort((a, b) => {
      const aVal = a[yCol] as number;
      const bVal = b[yCol] as number;
      return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
    });
  }

  // Apply limit
  return result.slice(0, limit);
};

export function ChartDisplay({ data, charts, onRegenerate }: ChartDisplayProps) {
  if (charts.length === 0) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {charts.map((chart) => (
        <FullscreenCard
          key={chart.id}
          title={chart.title}
          className="bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden"
        >
          <div className="p-6">
            <h3 className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-violet-400 to-fuchsia-400 mb-2">
              {chart.title}
            </h3>
            <p className="text-gray-400 mb-4">{chart.description}</p>
            <SingleChart data={data} chart={chart} onRegenerate={onRegenerate} />
          </div>
        </FullscreenCard>
      ))}
    </div>
  );
}

function SingleChart({ data, chart, onRegenerate }: SingleChartProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  const [showBrush, setShowBrush] = useState(false);
  const [showTrendline, setShowTrendline] = useState(false);
  const [limitResults, setLimitResults] = useState<number>(20);

  const processedData = useMemo(
    () => processChartData(data, chart, sortOrder, limitResults),
    [data, chart, sortOrder, limitResults]
  );

  // Find actual column names from data
  const xColName = data.columns.find(
    (col) =>
      col.name === chart.xAxis ||
      col.name.toLowerCase() === chart.xAxis.toLowerCase()
  )?.name ?? chart.xAxis;

  const yColName = data.columns.find(
    (col) =>
      col.name === chart.yAxis ||
      col.name.toLowerCase() === chart.yAxis.toLowerCase()
  )?.name ?? chart.yAxis;

  // Calculate average for trend line
  const average = useMemo(() => {
    if (processedData.length === 0) return 0;
    const sum = processedData.reduce((acc, item) => {
      const val = item[yColName];
      return acc + (typeof val === "number" ? val : 0);
    }, 0);
    return sum / processedData.length;
  }, [processedData, yColName]);

  const handleRegenerate = async () => {
    if (!onRegenerate) return;
    setIsRegenerating(true);
    try {
      await onRegenerate(chart);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleExportCSV = useCallback(() => {
    if (processedData.length === 0) return;
    
    const headers = Object.keys(processedData[0] ?? {}).join(",");
    const rows = processedData.map((row) => 
      Object.values(row).map((v) => `"${String(v)}"`).join(",")
    ).join("\n");
    
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chart.title.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [processedData, chart.title]);

  const toggleSort = () => {
    setSortOrder((prev) => {
      if (prev === "none") return "desc";
      if (prev === "desc") return "asc";
      return "none";
    });
  };

  // Render chart content helper
  const renderChartContent = (
    type: ChartType,
    chartData: ChartDataPoint[],
    xKey: string,
    yKey: string,
    enableBrush?: boolean,
    enableTrendline?: boolean,
    avgValue?: number
  ) => {
    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 50 },
    };

    const brushComponent = enableBrush ? (
      <Brush dataKey={xKey} height={30} stroke="#8b5cf6" fill="#1e1b4b" />
    ) : null;

    const trendlineComponent = enableTrendline && avgValue ? (
      <ReferenceLine y={avgValue} stroke="#10b981" strokeDasharray="5 5" label={{ value: `Avg: ${avgValue.toFixed(2)}`, fill: "#10b981", fontSize: 12 }} />
    ) : null;

    switch (type) {
      case "bar":
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey={xKey}
              stroke="#9ca3af"
              fontSize={11}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
              tick={{ fill: "#9ca3af" }}
            />
            <YAxis stroke="#9ca3af" fontSize={12} tick={{ fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
              }}
            />
            <Legend />
            {trendlineComponent}
            <Bar dataKey={yKey} fill="#8b5cf6" radius={[4, 4, 0, 0]}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
            {brushComponent}
          </BarChart>
        );

      case "line":
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey={xKey}
              stroke="#9ca3af"
              fontSize={11}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
              tick={{ fill: "#9ca3af" }}
            />
            <YAxis stroke="#9ca3af" fontSize={12} tick={{ fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
              }}
            />
            <Legend />
            {trendlineComponent}
            <Line
              type="monotone"
              dataKey={yKey}
              stroke="#8b5cf6"
              strokeWidth={3}
              dot={{ fill: "#8b5cf6" }}
              activeDot={{ r: 8 }}
            />
            {brushComponent}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="colorY" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey={xKey}
              stroke="#9ca3af"
              fontSize={11}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
              tick={{ fill: "#9ca3af" }}
            />
            <YAxis stroke="#9ca3af" fontSize={12} tick={{ fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
              }}
            />
            <Legend />
            {trendlineComponent}
            <Area type="monotone" dataKey={yKey} stroke="#8b5cf6" fillOpacity={1} fill="url(#colorY)" />
            {brushComponent}
          </AreaChart>
        );

      case "scatter":
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              type="category"
              dataKey={xKey}
              stroke="#9ca3af"
              fontSize={11}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
              tick={{ fill: "#9ca3af" }}
            />
            <YAxis type="number" dataKey={yKey} stroke="#9ca3af" fontSize={12} tick={{ fill: "#9ca3af" }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
              }}
            />
            <Legend />
            <Scatter name={yKey} data={chartData} fill="#8b5cf6" />
          </ScatterChart>
        );

      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData}
              innerRadius={60}
              outerRadius={100}
              paddingAngle={5}
              dataKey={yKey}
              nameKey={xKey}
              label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={{ stroke: "#9ca3af" }}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
              }}
            />
            <Legend />
          </PieChart>
        );

      default:
        return null;
    }
  };

  if (processedData.length === 0) {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center text-gray-400 gap-4">
        <div className="text-center">
          <p className="font-medium text-red-400 mb-1">Unable to generate this chart</p>
          <p className="text-sm text-gray-500 mb-4">
            Columns: {chart.xAxis}, {chart.yAxis}
          </p>
          {onRegenerate && (
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRegenerating ? "animate-spin" : ""}`} />
              {isRegenerating ? "Regenerating..." : "Regenerate with AI"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Chart Controls Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
        {/* Sort Control */}
        <button
          onClick={toggleSort}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            sortOrder !== "none" 
              ? "bg-violet-500/20 text-violet-400 border border-violet-500/30" 
              : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
          title="Sort by value"
        >
          {sortOrder === "asc" ? (
            <SortAsc className="w-4 h-4" />
          ) : sortOrder === "desc" ? (
            <SortDesc className="w-4 h-4" />
          ) : (
            <SortDesc className="w-4 h-4 opacity-50" />
          )}
          Sort
        </button>

        {/* Limit Results */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={limitResults}
            onChange={(e) => setLimitResults(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-violet-500/50"
          >
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
            <option value={999999}>All</option>
          </select>
        </div>

        {/* Brush/Zoom Toggle */}
        {(chart.type === "line" || chart.type === "area" || chart.type === "bar") && (
          <button
            onClick={() => setShowBrush(!showBrush)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showBrush 
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" 
                : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
            }`}
            title="Enable zoom/brush"
          >
            <RotateCcw className="w-4 h-4" />
            Zoom
          </button>
        )}

        {/* Trend Line Toggle */}
        {(chart.type === "bar" || chart.type === "line" || chart.type === "area") && (
          <button
            onClick={() => setShowTrendline(!showTrendline)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showTrendline 
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
            }`}
            title="Show average line"
          >
            <TrendingUp className="w-4 h-4" />
            Average
          </button>
        )}

        <div className="flex-1" />

        {/* Export Button */}
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Export chart data as CSV"
        >
          <Download className="w-4 h-4" />
          Export
        </button>

        {/* Regenerate Button */}
        {onRegenerate && (
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRegenerating ? "animate-spin" : ""}`} />
            {isRegenerating ? "..." : "Regenerate"}
          </button>
        )}
      </div>

      {/* Chart */}
      <div className="h-[450px] w-full">
        <ResponsiveContainer key={`chart-${chart.id}-${showBrush ? 'brush' : 'no-brush'}`} width="100%" height="100%">
          {renderChartContent(chart.type, processedData, xColName, yColName, showBrush, showTrendline, average)}
        </ResponsiveContainer>
      </div>

      {/* Metadata Tags */}
      <div className="flex gap-2 mt-4">
        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-400">
          X: {chart.xAxis}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-400">
          Y: {chart.yAxis}
        </span>
        {chart.aggregation && chart.aggregation !== "none" && (
          <span className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
            {chart.aggregation}
          </span>
        )}
        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-400">
          {processedData.length} items
        </span>
      </div>
    </div>
  );
}
