import { useMemo } from "react";
import { isConfigured } from "llm-connect";
import type { AIServiceConfig } from "./ai-service";
import type { StoredSettings } from "./storage";

/**
 * The one rule for "AI features are usable": llm-connect's (a provider key, or
 * a custom endpoint with a model name, whose key is optional).
 */
export function isAIConfigured(
  settings: StoredSettings | null | undefined,
): settings is StoredSettings {
  return isConfigured(settings);
}

/** Settings as the AI service expects them, for one request. */
export function toServiceConfig(
  settings: StoredSettings,
  signal?: AbortSignal,
): AIServiceConfig {
  return {
    signal,
    apiKey: settings.apiKey,
    model: settings.model,
    providerId: settings.providerId,
    providerNpm: settings.providerNpm,
    providerApi: settings.providerApi,
    language: settings.language,
    customEndpoint: settings.customEndpoint,
    customModel: settings.customModel,
  };
}

/** Whether AI is configured, and the request config built from the settings. */
export function useAIConfig(settings: StoredSettings | null) {
  return useMemo(() => {
    const ready = isAIConfigured(settings);
    return {
      ready,
      /** Config for one request, or null when AI is not configured. */
      configFor: (signal?: AbortSignal): AIServiceConfig | null =>
        ready ? toServiceConfig(settings!, signal) : null,
    };
  }, [settings]);
}
