import type { TabularData, ChartConfig, ChartTheme } from "./types";
import { defaultDarkTheme } from "./types";
import { ChartThemeProvider } from "./ThemeContext";
import { SingleChart } from "./SingleChart";

export interface ChartDisplayProps {
  data: TabularData;
  charts: ChartConfig[];
  onRegenerate?: (chart: ChartConfig) => Promise<void>;
  /** Optional wrapper component for each chart card */
  cardWrapper?: React.ComponentType<{
    children: React.ReactNode;
    title?: string;
    className?: string;
  }>;
  /** Optional theme override */
  theme?: ChartTheme;
  /** Additional CSS class for the outer container */
  className?: string;
  /** Additional CSS class for each chart card */
  chartClassName?: string;
  /** Additional CSS class for chart title */
  titleClassName?: string;
  /** Additional CSS class for chart description */
  descriptionClassName?: string;
  /** When true, removes all built-in Tailwind classes. You must style everything yourself. */
  unstyled?: boolean;
}

function DefaultCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

export function ChartDisplay({
  data,
  charts,
  onRegenerate,
  cardWrapper: CardWrapper = DefaultCard,
  theme = defaultDarkTheme,
  className,
  chartClassName,
  titleClassName,
  descriptionClassName,
  unstyled = false,
}: ChartDisplayProps) {
  if (charts.length === 0) return null;

  const containerCls = unstyled
    ? (className ?? "")
    : `animate-fade-in space-y-6 ${className ?? ""}`.trim();

  const cardCls = unstyled
    ? (chartClassName ?? "")
    : `overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 ${chartClassName ?? ""}`.trim();

  const titleCls = unstyled
    ? (titleClassName ?? "")
    : `mb-2 bg-linear-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-xl font-bold text-transparent ${titleClassName ?? ""}`.trim();

  const descCls = unstyled
    ? (descriptionClassName ?? "")
    : `mb-4 text-gray-400 ${descriptionClassName ?? ""}`.trim();

  const innerCls = unstyled ? "" : "p-6";

  return (
    <ChartThemeProvider theme={theme}>
      <div className={containerCls}>
        {charts.map((chart) => (
          <CardWrapper key={chart.id} title={chart.title} className={cardCls}>
            <div className={innerCls} data-chart-id={chart.id}>
              <h3 className={titleCls}>{chart.title}</h3>
              <p className={descCls}>{chart.description}</p>
              <SingleChart
                data={data}
                chart={chart}
                onRegenerate={onRegenerate}
                unstyled={unstyled}
              />
            </div>
          </CardWrapper>
        ))}
      </div>
    </ChartThemeProvider>
  );
}
