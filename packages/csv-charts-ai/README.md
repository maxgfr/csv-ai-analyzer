# csv-charts-ai

AI-powered CSV analysis, chart generation, and interactive visualization. Built on the [Vercel AI SDK](https://sdk.vercel.ai/) and [Recharts](https://recharts.org/).

**Works with any LLM provider** — OpenAI, Anthropic, Google, Mistral, Ollama, or any OpenAI-compatible endpoint.

## Installation

```bash
pnpm add csv-charts-ai
```

Then install **only the AI provider(s) you need**:

```bash
# Pick one or more
pnpm add @ai-sdk/openai      # OpenAI / OpenAI-compatible (Ollama, vLLM, LM Studio…)
pnpm add @ai-sdk/anthropic    # Anthropic
pnpm add @ai-sdk/google       # Google Generative AI
pnpm add @ai-sdk/mistral      # Mistral
```

Core dependencies (`ai`, `zod`, `read-excel-file`) are bundled. AI provider SDKs are **optional peer dependencies** — you only install what you use.

**Optional peer dependencies** (only for React chart components): `react`, `recharts`, `lucide-react`.

## Quick Start

```ts
import { registerProvider, fromSDK, parseCSV, analyzeData, suggestQuestions } from "csv-charts-ai";
import { createOpenAI } from "@ai-sdk/openai";

// 1. Register your provider(s) — once, at app startup
registerProvider("openai", fromSDK(createOpenAI));

// 2. Parse CSV string into structured data
const data = parseCSV(`name,age,city,salary
Alice,30,Paris,75000
Bob,25,London,62000
Charlie,35,Berlin,88000`);

// 3. Run full AI analysis (summary + anomalies + charts) in parallel
const result = await analyzeData({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
});

console.log(result.summary.keyInsights);
console.log(`Found ${result.anomalies.length} anomalies`);
console.log(`Generated ${result.charts.length} chart suggestions`);

// 4. Suggest questions the user could ask
const questions = await suggestQuestions({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
});
questions.forEach(q => console.log(`[${q.category}] ${q.question}`));
```

## Provider Setup

Register AI providers **once** at app startup, before calling any AI function. You only install and register the providers you need.

### Using `@ai-sdk/*` packages

The `fromSDK()` helper wraps any `@ai-sdk/*` creator into the format the library expects:

```ts
import { registerProvider, fromSDK } from "csv-charts-ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";

registerProvider("openai", fromSDK(createOpenAI));
registerProvider("anthropic", fromSDK(createAnthropic));
registerProvider("google", fromSDK(createGoogleGenerativeAI));
registerProvider("mistral", fromSDK(createMistral));
```

### Custom / self-hosted providers

For full control, pass a `ProviderFactory` directly — a function that receives `{ apiKey, model, baseURL?, headers? }` and returns a `LanguageModel`:

```ts
import { registerProvider } from "csv-charts-ai";

registerProvider("my-llm", (config) => {
  return myCustomSDK.createModel(config.apiKey, config.model);
});
```

### Batch registration

```ts
import { registerProviders, fromSDK } from "csv-charts-ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

registerProviders({
  openai: fromSDK(createOpenAI),
  anthropic: fromSDK(createAnthropic),
});
```

### Aliases

npm package names are resolved automatically — `"@ai-sdk/openai"` and `"openai"` map to the same slot. So `createModel({ provider: "openai" })` and `createAppModel({ providerNpm: "@ai-sdk/openai" })` both work after a single registration.

## CSV Parsing

Parse CSV strings into the `TabularData` format with automatic delimiter detection and column type inference.

```ts
import { parseCSV } from "csv-charts-ai";

// Auto-detects delimiter (comma, semicolon, tab, pipe)
const data = parseCSV(csvString);

// Explicit options
const data = parseCSV(csvString, {
  delimiter: ";",
  hasHeader: true,
  skipEmpty: true,
});

console.log(data.headers);   // ["name", "age", "city"]
console.log(data.rowCount);  // 100
console.log(data.columns);   // [{ name: "name", type: "string", index: 0 }, ...]
```

**Type inference** detects `string`, `number`, `date`, and `boolean` columns by sampling values. Handles quoted fields, escaped quotes, multi-line values, and BOM stripping (RFC 4180).

> For very large files or exotic encodings, consider using [PapaParse](https://www.papaparse.com/) and passing the result as `TabularData` directly.

## XLSX Parsing

Parse Excel (.xlsx) files into the same `TabularData` format. `read-excel-file` is bundled.

### Browser

```ts
import { parseXLSX } from "csv-charts-ai";

const data = await parseXLSX(file); // File from <input> or drag-and-drop
console.log(data.headers, data.rowCount);
```

### Node.js / Universal

Use `convertXLSXRows` with any XLSX reader — it takes raw row arrays and has zero dependencies:

```ts
import readXlsxFile from "read-excel-file/node";
import { convertXLSXRows } from "csv-charts-ai";

const rows = await readXlsxFile("data.xlsx");
const data = convertXLSXRows(rows);
```

Options: `{ hasHeader?: boolean, skipEmpty?: boolean }` — same defaults as `parseCSV`.

## AI Functions

All AI functions accept either a simple config object or a pre-built `LanguageModel` from the Vercel AI SDK. All support an optional `signal` (AbortSignal) for cancellation.

### Chart Suggestions

```ts
import { suggestCharts } from "csv-charts-ai";

// Simple — OpenAI (provider must be registered, see Provider Setup)
const charts = await suggestCharts({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
});

// Custom endpoint — Ollama / vLLM / LM Studio (uses the "openai" provider)
const charts = await suggestCharts({
  model: { apiKey: "", model: "llama3", baseURL: "http://localhost:11434/v1" },
  data,
});

// Other providers — Anthropic, Google, Mistral
const charts = await suggestCharts({
  model: { apiKey: "sk-ant-...", model: "claude-sonnet-4-20250514", provider: "anthropic" },
  data,
});

// Advanced — any LanguageModel instance (no registration needed)
import { createAnthropic } from "@ai-sdk/anthropic";
const anthropic = createAnthropic({ apiKey: "sk-ant-..." });
const charts = await suggestCharts({
  model: anthropic("claude-sonnet-4-20250514"),
  data,
  language: "French",
});
```

### Custom Chart from Prompt

```ts
import { suggestCustomChart } from "csv-charts-ai";

const chart = await suggestCustomChart({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
  prompt: "Show me a bar chart of revenue by category",
});
```

### Repair a Broken Chart

```ts
import { repairChart } from "csv-charts-ai";

const fixed = await repairChart({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  failedChart: brokenChart,
  columns: ["name", "sales", "date"],
  errorContext: "Column 'revenue' does not exist",
});
```

### Data Summary

```ts
import { summarizeData } from "csv-charts-ai";

const result = await summarizeData({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
});

console.log(result.summary);      // "This dataset contains sales records..."
console.log(result.keyInsights);   // ["Revenue peaks in Q4", "Product A leads..."]
console.log(result.dataQuality);   // "Good completeness, 2 missing values in..."
```

### Anomaly Detection

```ts
import { detectAnomalies } from "csv-charts-ai";

const anomalies = await detectAnomalies({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
  maxRows: 100, // default: 50
});

anomalies.forEach(a =>
  console.log(`[${a.severity}] Row ${a.row}, ${a.column}: ${a.issue}`)
);
```

### Ask Questions About Data

```ts
import { askAboutData, streamAskAboutData } from "csv-charts-ai";

// Non-streaming
const answer = await askAboutData({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
  question: "What is the average revenue by region?",
  history: [{ prompt: "How many rows?", response: "There are 1000 rows." }],
});

// Streaming
await streamAskAboutData({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
  question: "What trends do you see?",
  onChunk: (chunk) => process.stdout.write(chunk),
  onComplete: (full) => console.log("\nDone:", full.length, "chars"),
});
```

### Suggest Questions

```ts
import { suggestQuestions } from "csv-charts-ai";

const questions = await suggestQuestions({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
  count: 5,
});

questions.forEach(q => console.log(`[${q.category}] ${q.question}`));
// [trend] How has revenue changed month over month?
// [comparison] Which region has the highest average order value?
// [correlation] Is there a relationship between marketing spend and sales?
```

### Full Analysis Pipeline

Runs summary, anomaly detection, and chart suggestions in parallel:

```ts
import { analyzeData } from "csv-charts-ai";

const result = await analyzeData({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
  detectAnomalies: true,  // default: true
  suggestCharts: true,    // default: true
});

// result.summary   — DataSummaryResult
// result.anomalies — AnomalyResult[]
// result.charts    — ChartConfig[]
```

## Cancellation (AbortSignal)

All AI functions support `signal` for cancellation — essential for React cleanup and timeouts:

```ts
const controller = new AbortController();

const charts = await suggestCharts({
  model: { apiKey: "sk-...", model: "gpt-4o" },
  data,
  signal: controller.signal,
});

// Cancel from elsewhere
controller.abort();
```

React example:

```tsx
useEffect(() => {
  const controller = new AbortController();
  analyzeData({ model, data, signal: controller.signal })
    .then(setResult)
    .catch(() => {});
  return () => controller.abort();
}, [data]);
```

## React Components (`csv-charts-ai/charts`)

Chart components are available as a **separate entry point** so projects that only need AI/parsing don't pull in React or Recharts.

```bash
# Optional peer dependencies — only needed if you import from csv-charts-ai/charts
pnpm add react recharts
```

Icons are **built-in** (SVG, zero dependency). To use your own icon library, see [Custom Icons](#custom-icons) below.

### Display Charts

```tsx
import { ChartDisplay } from "csv-charts-ai/charts";

<ChartDisplay data={data} charts={charts} />
```

### With Theme

```tsx
import { ChartDisplay, defaultLightTheme } from "csv-charts-ai/charts";

<ChartDisplay data={data} charts={charts} theme={defaultLightTheme} />
```

### Custom Card Wrapper

```tsx
import { ChartDisplay } from "csv-charts-ai/charts";
import { repairChart } from "csv-charts-ai";

<ChartDisplay
  data={data}
  charts={charts}
  cardWrapper={({ children, title }) => (
    <div className="my-card">
      <h2>{title}</h2>
      {children}
    </div>
  )}
  onRegenerate={async (chart) => {
    const fixed = await repairChart({ model, failedChart: chart, columns: data.headers, errorContext: "Rendering failed" });
    // update state with fixed chart
  }}
/>
```

### Unstyled Mode (No Tailwind Required)

Pass `unstyled` to strip all built-in Tailwind classes and style components yourself:

```tsx
<ChartDisplay
  data={data}
  charts={charts}
  unstyled
  className="my-charts-container"
  chartClassName="my-chart-card"
  titleClassName="my-chart-title"
/>
```

You can also pass `className` to any component to add classes alongside the built-in ones:

```tsx
<ChartDisplay data={data} charts={charts} className="my-extra-class" />
```

### Custom Icons

Chart toolbar icons are built-in as minimal SVGs (zero dependency). To use your own icon library (lucide-react, heroicons, phosphor, etc.), wrap your charts with `ChartIconProvider`:

```tsx
import { ChartDisplay, ChartIconProvider } from "csv-charts-ai/charts";
import { RefreshCw, Download, ArrowUp, ArrowDown, RotateCcw, TrendingUp, Filter, Image } from "lucide-react";

const icons = { RefreshCw, Download, SortAsc: ArrowUp, SortDesc: ArrowDown, RotateCcw, TrendingUp, Filter, ImageIcon: Image };

<ChartIconProvider icons={icons}>
  <ChartDisplay data={data} charts={charts} />
</ChartIconProvider>
```

You only need to override the icons you want to change — the rest fall back to the built-in SVGs.

### Headless Usage (No React)

The core entry point (`csv-charts-ai`) works without React — use it in Node.js scripts, APIs, or CLI tools:

```ts
import { registerProvider, fromSDK, parseCSV, analyzeData } from "csv-charts-ai";
import { createOpenAI } from "@ai-sdk/openai";
import { readFileSync } from "fs";

registerProvider("openai", fromSDK(createOpenAI));

const csv = readFileSync("sales.csv", "utf-8");
const data = parseCSV(csv);

const result = await analyzeData({
  model: { apiKey: process.env.OPENAI_API_KEY!, model: "gpt-4o" },
  data,
});

console.log(result.summary.keyInsights);
```

## Components Reference (`csv-charts-ai/charts`)

| Export | Description |
|--------|-------------|
| `ChartDisplay` | Multi-chart container with optional card wrapper and theme |
| `SingleChart` | Individual chart with toolbar (sort, zoom, trendline, CSV/PNG export) |
| `ChartToolbar` | Standalone toolbar component |
| `ChartThemeProvider` | React context for chart theming |
| `ChartIconProvider` | React context for pluggable icons (default: built-in SVGs) |
| `defaultDarkTheme` / `defaultLightTheme` | Built-in themes |
| `defaultIcons` | Built-in SVG icon set |

## AI Functions Reference

| Export | Description |
|--------|-------------|
| `suggestCharts(options)` | Generate 2-4 chart suggestions from data |
| `suggestCustomChart(options)` | Generate a single chart from a text prompt |
| `repairChart(options)` | Fix a chart config that failed to render |
| `summarizeData(options)` | AI-generated data summary with key insights |
| `detectAnomalies(options)` | Find outliers, missing values, type mismatches |
| `askAboutData(options)` | Ask natural language questions about data |
| `streamAskAboutData(options)` | Streaming version of askAboutData |
| `suggestQuestions(options)` | Suggest interesting questions to ask about the data |
| `analyzeData(options)` | Full pipeline: summary + anomalies + charts in parallel |

## Provider Registry Reference

| Export | Description |
|--------|-------------|
| `registerProvider(name, factory)` | Register a provider by name |
| `registerProviders(map)` | Register multiple providers at once |
| `fromSDK(creator)` | Wrap an `@ai-sdk/*` creator into a `ProviderFactory` |
| `getProvider(name)` | Get a registered provider (or `undefined`) |
| `hasProvider(name)` | Check if a provider is registered |
| `clearProviders()` | Remove all registered providers (for testing) |

## Utilities Reference

| Export | Description |
|--------|-------------|
| `parseCSV(csv, options?)` | Parse CSV string into `TabularData` |
| `parseXLSX(file, options?)` | Parse XLSX file into `TabularData` (browser) |
| `convertXLSXRows(rows, options?)` | Convert raw XLSX rows into `TabularData` (universal) |
| `computeDiff(dataA, dataB, options)` | Compare two datasets (index, key, or content matching) |
| `createModel(config)` | Create a LanguageModel from an AIConfig |
| `createAppModel(config)` | Create a LanguageModel from multi-provider app config |
| `resolveModel(input)` | Resolve AIConfig, AppModelConfig, or LanguageModel |
| `generateDataSummary(data)` | Detailed human-readable data summary with sample rows |
| `summarizeTabularData(data)` | Compact data summary for AI prompt consumption |
| `getAIErrorMessage(error)` | Extract user-friendly error messages |
| `processChartData(data, chart)` | Process and aggregate chart data |
| `processChartDataMultiSeries(data, chart)` | Multi-series data processing |
| `COLORS` | Default 8-color palette |

## Validation Schemas

| Export | Description |
|--------|-------------|
| `AIConfigSchema` | Zod schema for validating AI config objects |
| `TabularDataSchema` | Zod schema for validating TabularData input |

## Chart Types

`bar` | `line` | `area` | `scatter` | `pie`

Multi-series supported via `groupBy` for bar, line, and area charts.

## Aggregation Types

`sum` | `avg` | `count` | `min` | `max` | `none`

## CSV Diff

Compare two datasets and detect added, removed, and changed rows:

```ts
import { computeDiff } from "csv-charts-ai";

const diff = computeDiff(dataA, dataB, { matchMode: "key", keyColumn: "id" });

console.log(diff.counts); // { same: 10, changed: 3, added: 2, removed: 1 }
diff.rows.forEach(r => {
  if (r.status === "changed") {
    console.log(`Row ${r.indexA}: changed columns: ${[...r.changedCols].join(", ")}`);
  }
});
```

Match modes: `"index"` (positional), `"key"` (by column value), `"content"` (full row match).

## Provider Support

Install only the provider(s) you need and register them at startup (see [Provider Setup](#provider-setup)).

| Provider | Install | Config |
|----------|---------|--------|
| OpenAI | `@ai-sdk/openai` | `{ apiKey, model }` |
| Anthropic | `@ai-sdk/anthropic` | `{ provider: "anthropic", apiKey, model }` |
| Google | `@ai-sdk/google` | `{ provider: "google", apiKey, model }` |
| Mistral | `@ai-sdk/mistral` | `{ provider: "mistral", apiKey, model }` |
| Ollama / vLLM / LM Studio | `@ai-sdk/openai` | `{ apiKey: "", model, baseURL }` |
| Custom provider | — | `registerProvider("name", factory)` |
| Any LanguageModel | — | Pass instance directly |

## License

MIT

## Import diagnostics and local quality

```ts
import { parseXLSX, listXLSXSheets, analyzeDataQuality } from "csv-charts-ai";

const sheets = await listXLSXSheets(file);
const data = await parseXLSX(file, {
  sheet: sheets[0],           // name or one-based index; defaults to the first sheet
  preserveExtraColumns: true // generated names retain cells beyond the header width
});
const quality = analyzeDataQuality(data);
// { rowCount, duplicateRows, columns: [{ name, missing, invalid }] }
```

Both Excel entry points support browsers and Web Workers. `duplicateRows` counts
occurrences beyond the first exact row; `invalid` counts nonempty values that do
not match the inferred column type. These functions never change the input.
Excel dates are emitted as ISO strings. Duplicate/empty headers receive distinct
names, including case-insensitive collisions.

Existing parser signatures remain valid. `parseCSV` retains its existing behavior
of padding/truncating rows to the header width; the web application's import
preserves extra cells and reports normalization separately. `parseXLSX` likewise
retains its original width unless `preserveExtraColumns` is enabled.

Key-based `computeDiff` now matches duplicate-key occurrences in file order and
reports all remaining rows as added/removed. Its optional `duplicateKeys` result
contains repeated-occurrence counts for inputs `a` and `b`. Content matching uses
unambiguous keys and consumes each occurrence once.

Chart sorting considers all valid rows before limiting the result. When X and Y
have the same name, the numeric output gets a distinct key so it cannot overwrite
the X label. Consumers rendering processed data should use
`processChartDataMultiSeries(...).yKey`. Multi-series names that conflict with the
X key are also disambiguated. The React chart components handle these keys.

Shared helpers `detectCSVDelimiter`, `inferValuesType`, `uniqueHeaders`,
`parseNumericValue` and `parseDateValue` are available for adapters. Numeric parsing
rejects partial strings and non-finite values, supports decimal commas, and treats
commas followed by groups of three digits as thousands separators. Local dates
use day/month/year when ambiguous; missing/invalid numeric and date values return
`null`.

`fromSDK` selects a provider's `.chat()` method when an explicit base URL is used
and that method exists, supporting OpenAI-compatible Chat Completions servers.
Ordinary provider configurations retain their SDK's default model API.
