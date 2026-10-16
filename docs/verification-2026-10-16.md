# Verification — 2026-10-16

Scope: AI settings on llm-connect 1.1 (encrypted key, live catalog, SDKs on
demand), shared with db-schema-viewer. Base revision:
`49b0aaa658624b302a0ec7df068a37de3a45139e` (v1.16.0 plus the last catalog refresh).

## Changes covered

- **API key storage**: never in clear text. llm-connect's `secureStorage`
  encrypts it with AES-GCM under a non-extractable `CryptoKey` kept in IndexedDB
  (`csv-ai-secrets`); the ciphertext goes to IndexedDB with "Remember on this
  device", to `sessionStorage` (`csv-ai-settings-key`) otherwise. Preferences stay
  in `localStorage` (`csv-ai-settings`). The clear-text `csv-ai-api-key` of v1.16
  is re-encrypted once with the same choice, then deleted; legacy cookies are still
  migrated. Clear removes the preferences, the ciphertext and the `CryptoKey`.
- **Endpoints and CSP**: a custom endpoint must be https, or http on this machine;
  `connect-src` goes from `*` to `'self' https: http://localhost:* http://127.0.0.1:*`.
- **Catalog**: built in the browser from models.dev and OpenRouter when the
  settings open (`liveCatalog`); `public/models.json` is written at build time as
  the fallback and is no longer committed (the daily workflow is gone).
- **Models**: `loadModel` imports only the SDK the settings need. The AI SDK
  packages move to their latest 3.x / 6.x: with 3.0.63, structured output to
  Claude Sonnet 5.5 failed (`tool_choice: type "tool" and "any" are not
  supported for this model`).
- **Settings dialog**: 16 response languages stored as codes, Clear button,
  defaults (recommended providers, test mode) from llm-connect.

## Automated checks

| Check | Result |
|-------|--------|
| `pnpm lint`, `pnpm typecheck` | pass |
| `pnpm test` (app) | 103 passed |
| `pnpm --filter csv-charts-ai test` | 162 passed |
| Playwright, chromium and mobile | 27 + 27 passed |
| `pnpm build:export` | pass |

## Bundle (home page, static export, initial JS)

| | Scripts | Raw | Gzip |
|-|--------:|----:|-----:|
| Before (`providers/all`) | 23 | 1932 KiB | 520 KiB |
| After, same SDK versions | 16 | 1279 KiB | 366 KiB |
| After the SDK update | 15 | 1334 KiB | 380 KiB |

## Real provider test

Production export served locally, Chromium, a real Anthropic key passed through an
environment variable to a throwaway spec (not committed):

1. The settings fetch `https://models.dev/api.json` (and OpenRouter); Anthropic's
   recommended model, Claude Sonnet 5.5, is preselected.
2. Test: one real generation, `200 POST /v1/messages`.
3. Remember + French, saved.
4. Summary of the sample sales data: answered in French.
5. Cookies, `localStorage`, `sessionStorage` and IndexedDB hold no copy of the
   key: preferences, opaque ciphertext and a `CryptoKey` with
   `extractable=false`.
6. After a reload the key is decrypted and a second summary succeeds.
7. Clear: nothing left (no preferences, ciphertext or `CryptoKey`).
8. `http://192.168.1.10/v1` is refused; the Ollama preset (`http://localhost:11434/v1`) saves.
9. With models.dev and OpenRouter blocked, the 209 providers come from `/models.json`.
