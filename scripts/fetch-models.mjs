#!/usr/bin/env node
// Build public/models.json, the provider/model catalog shown in the API settings.
// Runs in Node only (CI and `pnpm fetch-models`); llm-models never reaches the client bundle.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  fetchModelsDevModels,
  listProviders,
  setCacheEnabled,
} from "llm-models";

const OUT_PATH = fileURLToPath(
  new URL("../public/models.json", import.meta.url),
);

/** SDKs registered in src/lib/ai-service.ts; other providers cannot be called. */
const REGISTERED_NPM = new Set([
  "@ai-sdk/openai",
  "@ai-sdk/anthropic",
  "@ai-sdk/google",
  "@ai-sdk/mistral",
  "@ai-sdk/openai-compatible",
]);
const REQUIRED_PROVIDERS = ["openai", "anthropic", "google", "mistral"];

/** Recursively sort object keys so the output is stable between runs. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  return value;
}

function buildCatalog(modelsDev, providers) {
  // listProviders() has the routing info (api/npm); models.dev has the raw model ids
  const routing = new Map(providers.map((p) => [p.id, p]));
  const catalog = {};
  for (const [id, provider] of Object.entries(modelsDev)) {
    const info = routing.get(id);
    const npm = info?.npm ?? provider.npm;
    const api = info?.api ?? provider.api;
    if (!npm || !REGISTERED_NPM.has(npm)) continue;
    if (npm === "@ai-sdk/openai-compatible" && !api) continue;
    const models = {};
    for (const [modelId, model] of Object.entries(provider.models ?? {})) {
      models[modelId] = {
        id: modelId,
        name: model.name ?? modelId,
        ...(model.tool_call !== undefined && { tool_call: !!model.tool_call }),
        ...(model.reasoning !== undefined && { reasoning: !!model.reasoning }),
        ...(model.limit?.context && {
          limit: { context: model.limit.context },
        }),
      };
    }
    if (Object.keys(models).length === 0) continue;
    catalog[id] = {
      id,
      name: provider.name ?? id,
      npm,
      ...(api && { api }),
      models,
    };
  }
  return sortKeys(catalog);
}

function validate(catalog) {
  const problems = REQUIRED_PROVIDERS.filter(
    (id) => !catalog[id] || Object.keys(catalog[id].models).length === 0,
  );
  if (problems.length)
    throw new Error(`Catalog is missing models for: ${problems.join(", ")}`);
}

async function main() {
  setCacheEnabled(false);
  console.log("[fetch-models] Fetching models.dev catalog via llm-models");
  const [modelsDev, providers] = await Promise.all([
    fetchModelsDevModels(),
    listProviders(),
  ]);
  const catalog = buildCatalog(modelsDev, providers);
  validate(catalog);

  const json = JSON.stringify(catalog);
  const previous = await readFile(OUT_PATH, "utf8").catch(() => null);
  if (previous === json) {
    console.log("[fetch-models] Unchanged:", OUT_PATH);
    return;
  }
  await writeFile(OUT_PATH, json, "utf8");
  const providerCount = Object.keys(catalog).length;
  const modelCount = Object.values(catalog).reduce(
    (n, p) => n + Object.keys(p.models).length,
    0,
  );
  console.log(
    `[fetch-models] Wrote ${OUT_PATH}: ${providerCount} providers, ${modelCount} models, ${(json.length / 1024).toFixed(0)} KiB`,
  );
}

main().catch((err) => {
  console.error(
    "[fetch-models] Error:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
