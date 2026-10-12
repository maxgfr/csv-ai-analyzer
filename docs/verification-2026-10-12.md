# Verification — 2026-10-12

Scope: the Next.js application, the `csv-charts-ai` workspace package, the model
catalog script and the CI workflows. Base revision: `e04fc3284bc9036f3d84a69cf007c7ab12c16891`.

## Changes covered

- **Parsing**: a quote inside an unquoted field is literal (`55" TV`); `0,123` is a
  decimal; ISO datetimes with a space or one-digit parts parse, without offset as UTC;
  day/month order is chosen once per column; column types are inferred from up to
  1,000 values spread over the whole file. App import: no phantom last row, recovered
  stray quotes are a warning, UTF-16 byte order marks are honoured.
- **Comparison**: files without a common column report every row as added/removed
  (`noCommonColumns`); the key selector stays mounted while recomputing.
- **Charts**: Top N keeps the largest values, line/area charts over dates or numbers
  are chronological, pies get an "Other" slice, grouped charts keep the 8 largest
  groups and show gaps (`null`) instead of zeros, scatter plots use a numeric axis
  without Top N (capped at 2,000 points), values keep 6 significant digits.
- **AI**: aborts propagate untouched; other errors keep `cause`, `statusCode` and
  `isRetryable`; status codes are matched as whole words; the app is the only retry
  layer (`maxRetries: 0` in the SDK) and does not retry network/CORS failures;
  `analyzeData` cancels siblings on the first failure; prompts clip cells to 200
  characters and bound chat history; invented chart columns are dropped.
  Anthropic-compatible providers (MiniMax…) now receive their own base URL.
- **API key storage**: no cookies. The key lives in `sessionStorage`, or in
  `localStorage` with "Remember on this device"; preferences and theme in
  `localStorage`. Old cookies are migrated once (key remembered) and deleted.
- **UI**: requests are cancelled per action and spinners always reset; sorting or
  changing settings keeps AI results, filters (debounced 300 ms) clear them; a
  repaired chart stays repaired; the model list is fetched only when the settings
  open, with a Retry button; changing provider selects one of its models; Google
  keys are tested with `x-goog-api-key`; modals close on Escape; CSV exports
  neutralise formulas; parser settings re-read the current file.
- **PDF / Markdown**: `$1,200 to $5,000` stays text; charts are captured by id in
  light colours; failed chat answers are left out; Noto Sans (Latin extended,
  Greek, Cyrillic, 112 KB per weight, OFL) is loaded only when needed, with a
  warning for CJK/emoji.
- **Performance**: catalog reduced from 9.2 MB to 920 KB (202 callable providers,
  6,468 models) by `scripts/fetch-models.mjs` with `llm-models`; large tables are
  searched/sorted by a long-lived worker returning row indices; chat streaming
  renders once per frame; chat charts load lazily; hidden tabs skip version checks.
- **SEO / a11y / security**: the landing is in the exported HTML; `/legal/` has its
  own canonical and title; sitemap URLs end with `/`; production CSP drops
  `'unsafe-eval'` and the ignored `frame-ancestors`; light-theme status colours
  meet 4.5:1; AI tabs are a `tablist`; icon buttons and menus are labelled.
- **CI**: the daily catalog job commits only on change and dispatches deploy and
  Docker builds; deploy builds the published commit; duplicate package builds removed.

## Checks

| Command | Result |
| --- | --- |
| `pnpm test:all` | package 169 passed, app 98 passed |
| `pnpm lint` | 0 errors, 0 warnings |
| `pnpm typecheck` | 0 errors |
| `pnpm build:github-pages` | static export built |
| `pnpm test:e2e` | 44 passed (Chromium desktop + mobile) |
| `node scripts/fetch-models.mjs` | 920 KB, rerun reports "Unchanged" |
| `action-validator` on 4 workflows | valid |

Browser smoke test of the GitHub Pages export served under `/csv-ai-analyzer/`
(production CSP): CSV import, manual chart, settings modal (no `models.json`
request on the landing, one after opening), PDF export (Helvetica for Latin text,
Noto Sans fetched and embedded for Cyrillic/Polish headers), XLSX second sheet.
No console error, CSP violation or hydration error; no cookie set.

## Known limits

- `tsc -p packages/csv-charts-ai` reports 23 type errors in its test files
  (mock shapes), unchanged from the base revision; no gate type-checks them.
- A PDF embedding a captured chart weighed about 6 MB in the smoke test (full
  resolution PNG at 2× scale); not changed here.
- CJK text is not rendered in PDFs; the export warns instead.
