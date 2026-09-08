# Verification — 2026-09-08

Scope: the Next.js application and the public `csv-charts-ai` workspace package.
Reference revision: `fce70197fb75f6928f5332a9bebc73b17b9437df`.
The changes are local; this report does not describe a published release.

## Behavior repaired

- Content comparison now matches duplicate rows with cursors instead of repeatedly
  scanning already matched occurrences. Key comparison preserves every duplicate
  occurrence in input order and reports repeated keys. Length-prefixed signatures
  prevent embedded separator characters from creating false matches.
- Charts sort the complete input before limiting it, continue past invalid numeric
  values, and keep distinct X/Y fields when counting the X column. Multi-series
  names cannot overwrite the X field. Manual charts are available without an API
  key and survive the first lazy chart mount.
- Number parsing rejects incomplete/non-finite values and handles documented
  grouping and decimal formats consistently. Calendar validation rejects invalid
  numeric dates. Excel dates use ISO strings and the default sheet is explicitly
  the first sheet.
- Imports respect encoding and quoted delimiters. The application preserves extra
  cells, creates distinct headers, and reports malformed quotes and irregular
  widths. Reimport resets dependent views and results.
- Table search runs before pagination; empty pages and page bounds are handled.
  Comparison statistics avoid spreading large arrays onto the call stack.
- Cancellation interrupts requests and retry delays. Late responses cannot update
  a replaced dataset; failed analysis sections can be retried separately. Custom
  OpenAI-compatible endpoints use Chat Completions.
- Fullscreen views support keyboard focus and restore scrolling. Mobile controls
  wrap, and settings buttons retain accessible names when labels are hidden.
- Static social images now build with the static export configuration.

## Added capabilities and performance changes

- Import preview (20 rows), delimiter/encoding/header controls, Excel sheet
  selection, and reimport from the original file retained in memory.
- Local data quality: missing values, inferred-type mismatches, and duplicate rows.
- Search across all transformed rows, with clear separation between preview search
  and the complete transformed dataset used by analyses and exports.
- Import, quality, and comparison workers; table and transform workers starting
  at 10,000 rows. Cancelling a worker terminates its computation.
- Shared parsing helpers, cached application summaries, fewer intermediate numeric
  arrays, and lazy chart/PDF loading.

## Validation

| Check | Result |
| --- | --- |
| Package unit tests | 139 passed |
| Application unit/component tests | 57 passed |
| Playwright | 18 passed: 9 scenarios on desktop and mobile Chromium |
| ESLint and TypeScript | Passed |
| Static export with GitHub Pages base path | Built successfully |
| Static production browser smoke | CSV import, Excel second sheet, quality worker, and lazy manual chart passed; no page errors |
| Static social images | Both generated files exist |
| Docker standalone | Image built and container started; Excel second-sheet import, quality worker, and both social-image HTTP responses passed |

Browser scenarios cover import/quality, filtering/reset, search, reimport, CSV
export, 100,000-row search including the last row, XLSX sheet selection, Latin-1
decoding, duplicate-key comparison, manual charts, chart CSV/PNG downloads, PDF
bytes, keyboard fullscreen, sample data, and theme persistence. AI scenarios use
mocked HTTP responses to exercise a custom endpoint, partial authentication
failure and retry, cancellation, stale-result suppression, and streamed chat.
Desktop light/dark and mobile screenshots were inspected.

Commands:

```sh
pnpm install --frozen-lockfile
pnpm test:all
pnpm lint
pnpm typecheck
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build:github-pages
docker build -t csv-ai-analyzer:local-audit .
pnpm benchmark
```

CI now runs both test suites and browser scenarios, uploads traces on failure,
and checks the generated social image files.

## Measurements

The same benchmark harness ran against the reference package and the modified
package on Node 24.19.0, macOS arm64. Inputs contain 1,000, 10,000 and 100,000 rows
with three columns. Each operation has five measured runs with explicit GC before
each run; the 100,000-row duplicate comparison has one run because the old path
takes minutes. The table gives milliseconds at 100,000 rows.

| Operation | Before | After |
| --- | ---: | ---: |
| Package CSV parsing | 45.06 | 21.65 |
| AI data summary preparation | 54.28 | 20.63 |
| Grouped chart aggregation | 7.23 | 17.33 |
| Content comparison, distinct rows | 212.78 | 177.16 |
| Content comparison, identical duplicate rows | 227,420.95 | 35.87 |
| Native filter control | 2.58 | 4.87 |
| Native sort control | 23.81 | 48.73 |

The duplicate path has a clear algorithmic improvement from repeated scans to
cursor lookup. The chart path now performs stricter numeric validation. These
measurements do **not** establish that every operation is faster: the unchanged
native filter/sort controls also vary substantially between runs on this shared
machine. They are not measurements of browser interactions or worker transfer
costs. Browser responsiveness at 100,000 rows is checked by the end-to-end scenario,
without a latency guarantee.

A sequential follow-up run, after the builds completed and excluding the slow
100,000-duplicate reference case, still showed substantial timing variability:
CSV parsing was 28.62/56.62 ms (before/after), summary preparation 47.59/52.64 ms,
chart aggregation 7.56/33.89 ms, and the unchanged native sort 96.11/55.19 ms.
Consequently, parsing and summary speedups should not be inferred from the first
table. Stricter chart parsing has measurable overhead in these samples. The
follow-up raw results are available [before](performance-followup-before-2026-09-08.json)
and [after](performance-followup-after-2026-09-08.json).

Raw measurements: [before](performance-before-2026-09-08.json) and
[after](performance-after-2026-09-08.json). `maxHeapDeltaMiB` samples heap usage at
the end minus the start of each operation; it is neither peak memory nor retained
memory, and GC during a run can affect it. No claim of reduced peak browser memory
is made. To compare another compiled package with the same harness:

```sh
node --expose-gc scripts/benchmark.mjs /absolute/path/to/reference/index.mjs
```

## Compatibility and remaining limits

- Existing package signatures remain usable; new options/exports are additive.
  The package's legacy CSV/XLSX column-width truncation remains the default. The
  application preserves extra columns; XLSX callers can opt into that behavior.
- Complete finite numbers are required. `1,234` means 1234; `12,50` means 12.5.
  Ambiguous local dates use day/month/year. This intentionally changes previously
  inconsistent permissive parsing. Normalize ambiguous data before importing it.
- Column inference samples up to 100 rows with an 80% threshold. Quality checks
  inspect all rows against those inferred types; they do not establish business
  validity or automatically repair data.
- Web Workers keep heavy loops off the main thread, but structured cloning and
  retained datasets still consume memory. The large-file check covers 100,000
  rows with few columns, not arbitrarily wide or unlimited files.
- AI responses are simulated in tests. Real provider availability, model quality,
  credentials, quotas, and local-server CORS have not been validated with live
  billable requests. Browser coverage is Chromium, including mobile emulation;
  Safari, Firefox, and physical devices were not tested.
- Recharts can emit a transient size warning before its initial resize observer
  measurement; the rendered charts and downloads pass the browser checks.
- Passing these checks provides regression coverage for the listed paths, not a
  guarantee that the program contains no remaining bugs.
