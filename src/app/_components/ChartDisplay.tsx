"use client";

import {
  ChartDisplay as BaseChartDisplay,
  ChartIconProvider,
  defaultDarkTheme,
  defaultLightTheme,
} from "csv-charts-ai/charts";
import {
  RefreshCw,
  Download,
  SortAsc,
  SortDesc,
  RotateCcw,
  TrendingUp,
  Filter,
  Image,
  FileDown,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import type { CSVData } from "~/lib/csv-parser";
import type { ChartSuggestion } from "~/lib/ai-service";
import { useTheme } from "~/lib/theme";
import { FullscreenCard } from "./FullscreenCard";

const lucideIcons = {
  RefreshCw,
  Download,
  SortAsc,
  SortDesc,
  RotateCcw,
  TrendingUp,
  Filter,
  ImageIcon: Image,
};

interface ChartDisplayProps {
  data: CSVData;
  charts: ChartSuggestion[];
  fileName?: string;
  onRegenerate?: (chart: ChartSuggestion) => Promise<void>;
}

export function ChartDisplay({
  data,
  charts,
  fileName,
  onRegenerate,
}: ChartDisplayProps) {
  const { resolved } = useTheme();
  const chartTheme =
    resolved === "light" ? defaultLightTheme : defaultDarkTheme;

  const handleExportChartsPDF = async () => {
    try {
      const { exportChartsPDF } = await import("~/lib/pdf-export");
      await exportChartsPDF(charts, fileName);
      toast.success("Charts PDF exported");
    } catch (e) {
      console.error("Charts PDF export failed:", e);
      toast.error("Charts PDF export failed");
    }
  };

  return (
    <div>
      {/* Charts header */}
      <div className="flex items-center gap-4 border-b border-white/10 px-6 pt-6 pb-4">
        <div className="rounded-xl border border-violet-500/30 bg-linear-to-br from-violet-500/20 to-fuchsia-500/20 p-3">
          <BarChart3 className="h-6 w-6 text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">Charts</h3>
          <p className="text-sm text-gray-400">
            {charts.length} chart{charts.length !== 1 ? "s" : ""} generated
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportChartsPDF}
          className="flex items-center gap-2 rounded-lg bg-violet-500/10 px-3 py-2 text-sm text-violet-400 transition-colors hover:bg-violet-500/20 hover:text-violet-300"
          title="Export charts as PDF"
        >
          <FileDown className="h-4 w-4" />
          PDF
        </button>
      </div>

      {/* Charts grid */}
      <ChartIconProvider icons={lucideIcons}>
        <BaseChartDisplay
          data={data}
          charts={charts}
          onRegenerate={onRegenerate}
          cardWrapper={FullscreenCard}
          theme={chartTheme}
        />
      </ChartIconProvider>
    </div>
  );
}
