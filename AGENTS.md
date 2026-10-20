# AGENTS.md

## Project Overview

CSV AI Analyzer — a Next.js app for analyzing CSV and Excel (.xlsx) files with AI. The core logic lives in the standalone npm package `csv-charts-ai` in `packages/csv-charts-ai/`.

## Commands

```bash
pnpm dev              # Start dev server (Turbopack)
pnpm build            # Production build (Next.js)
pnpm lint             # Run ESLint
pnpm lint:fix         # Auto-fix lint + prettier issues
pnpm typecheck        # TypeScript type checking (tsc --noEmit)

# Package (csv-charts-ai)
cd packages/csv-charts-ai
pnpm build            # Build package with tsup
pnpm test             # Run vitest tests (173 tests)
pnpm test:watch       # Run tests in watch mode
```

## Before Committing

Always run before committing to catch issues early:

```bash
pnpm lint             # Must pass with 0 errors
pnpm build            # Must compile successfully (includes TypeScript check)
```

The project uses prettier via eslint (`prettier/prettier` rule). Use `pnpm lint:fix` to auto-format.

## Architecture

- **App**: Next.js 16 (App Router) in `src/`
- **Package** (`csv-charts-ai`): The "brain" of the project — bundles core deps (`ai`, `zod`, `read-excel-file`) and provides a **pluggable provider registry** (`registerProvider` / `fromSDK`) so consumers install only the AI SDKs they need (`@ai-sdk/openai`, `@ai-sdk/anthropic`, etc.) as optional peer deps. Chart components use a pluggable icon system (`ChartIconProvider`) — no `lucide-react` dependency. Only `react` and `recharts` remain as optional peer deps (for chart components).
- **State**: React local state + page-level props drilling + external store for AI chat (`src/lib/chat-store.ts`)
- **File parsing**: App uses PapaParse for CSV (`src/lib/csv-parser.ts`) and delegates to the package for XLSX. The package has its own zero-dep CSV parser.
- **AI service**: `src/lib/ai-service.ts` registers AI providers (`openai`, `anthropic`, `google`, `mistral`) at import time, then bridges app settings to the package's `createAppModel()`. All AI logic is delegated to the package.
- **Fullscreen**: `FullscreenCard` uses CSS `position: fixed` (not portals) to preserve child component state
- **Styling**: TailwindCSS v4, CSS variable-based theming (dark/light/auto), glass-morphism design
- **Theming**: `src/lib/theme.tsx` provides `ThemeProvider` with cookie persistence + system preference detection. Anti-flash script in `layout.tsx` applies the theme class before first paint.

## Key Conventions

- All components are client-side (`"use client"`)
- CSV and XLSX both produce the same `CSVData` type (structurally identical to the package's `TabularData`) — the rest of the app is format-agnostic
- The `csv-charts-ai` package is the central library: AI functions, model resolution, CSV diff, data summary, chart components all live there
- App-specific concerns (cookie storage, PapaParse parsing, chat state, UI components) stay in `src/lib/`
- Delimiter/encoding settings only apply to CSV files; XLSX files are parsed automatically
