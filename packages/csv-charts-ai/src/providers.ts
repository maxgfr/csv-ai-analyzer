import type { LanguageModel } from "ai";

// ============ Types ============

/** Configuration passed to a provider factory when creating a model. */
export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

/** A function that creates a LanguageModel from configuration. */
export type ProviderFactory = (config: ProviderConfig) => LanguageModel;

// ============ Internal registry ============

const registry = new Map<string, ProviderFactory>();

/** Known aliases: npm package names → simple provider names. */
const ALIASES: Record<string, string> = {
  "@ai-sdk/openai": "openai",
  "@ai-sdk/anthropic": "anthropic",
  "@ai-sdk/google": "google",
  "@ai-sdk/mistral": "mistral",
};

function resolveAlias(name: string): string {
  return ALIASES[name] ?? name;
}

// ============ Public API ============

/**
 * Register a provider factory under a given name.
 *
 * The name can be a simple identifier (`"openai"`) or an npm package name
 * (`"@ai-sdk/openai"`) — aliases are resolved automatically so both map
 * to the same slot.
 *
 * @example
 * ```ts
 * import { registerProvider, fromSDK } from "csv-charts-ai";
 * import { createOpenAI } from "@ai-sdk/openai";
 * import { createAnthropic } from "@ai-sdk/anthropic";
 *
 * registerProvider("openai", fromSDK(createOpenAI));
 * registerProvider("anthropic", fromSDK(createAnthropic));
 *
 * // Custom provider with full control
 * registerProvider("my-llm", (config) => {
 *   return myCustomSDK.createModel(config.apiKey, config.model);
 * });
 * ```
 */
export function registerProvider(name: string, factory: ProviderFactory): void {
  const resolved = resolveAlias(name);
  registry.set(resolved, factory);
}

/**
 * Register multiple providers at once.
 *
 * @example
 * ```ts
 * registerProviders({
 *   openai: fromSDK(createOpenAI),
 *   anthropic: fromSDK(createAnthropic),
 *   google: fromSDK(createGoogleGenerativeAI),
 * });
 * ```
 */
export function registerProviders(
  providers: Record<string, ProviderFactory>,
): void {
  for (const [name, factory] of Object.entries(providers)) {
    registerProvider(name, factory);
  }
}

/**
 * Wrap an AI SDK provider creator into a {@link ProviderFactory}.
 *
 * All `@ai-sdk/*` packages export a creator following the pattern:
 * ```
 * createXxx(options) → provider(modelName) → LanguageModel
 * ```
 *
 * This helper adapts that two-step pattern into a single-step
 * `ProviderFactory`.
 *
 * @example
 * ```ts
 * import { createOpenAI } from "@ai-sdk/openai";
 * import { fromSDK, registerProvider } from "csv-charts-ai";
 *
 * registerProvider("openai", fromSDK(createOpenAI));
 * ```
 */
export function fromSDK(
  // Intentionally loose: every @ai-sdk/* creator has a slightly different
  // type signature, but they all follow (options) => (model) => LanguageModel.

  creator: (options: any) => any,
): ProviderFactory {
  return (config: ProviderConfig): LanguageModel => {
    const provider = creator({
      apiKey: config.apiKey,
      ...(config.baseURL && { baseURL: config.baseURL }),
      ...(config.headers && { headers: config.headers }),
    });
    // OpenAI-compatible servers generally implement Chat Completions rather than Responses.
    if (config.baseURL && typeof provider.chat === "function")
      return provider.chat(config.model) as LanguageModel;
    return provider(config.model) as LanguageModel;
  };
}

/** Get a provider by name, or `undefined` if not registered. */
export function getProvider(name: string): ProviderFactory | undefined {
  return registry.get(resolveAlias(name));
}

/** Check whether a provider is registered. */
export function hasProvider(name: string): boolean {
  return registry.has(resolveAlias(name));
}

/**
 * Remove all registered providers.
 * Useful for testing — not intended for production use.
 */
export function clearProviders(): void {
  registry.clear();
}

/**
 * Get a registered provider or throw with a helpful error.
 * @internal used by `createModel` / `createAppModel`.
 */
export function requireProvider(name: string): ProviderFactory {
  const resolved = resolveAlias(name);
  const factory = registry.get(resolved);

  if (!factory) {
    const npmHint: Record<string, string> = {
      openai: "@ai-sdk/openai",
      anthropic: "@ai-sdk/anthropic",
      google: "@ai-sdk/google",
      mistral: "@ai-sdk/mistral",
    };

    const pkg = npmHint[resolved];
    const example = pkg
      ? `  import { registerProvider, fromSDK } from "csv-charts-ai";\n` +
        `  import { create... } from "${pkg}";\n` +
        `  registerProvider("${resolved}", fromSDK(create...));`
      : `  import { registerProvider } from "csv-charts-ai";\n` +
        `  registerProvider("${resolved}", (config) => /* your LanguageModel */);`;

    throw new Error(
      `Provider "${resolved}" is not registered.\n\n` +
        `Register it before calling AI functions:\n\n${example}\n`,
    );
  }

  return factory;
}
