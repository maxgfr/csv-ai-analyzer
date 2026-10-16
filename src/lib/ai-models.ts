export type ProviderId = string;

// Allow arbitrary model IDs (including vendor-specific names) — keep typed known IDs but accept custom strings
export type ModelId = string;

// Default provider when nothing is selected yet; its model comes from the catalog's defaultModel
export const DEFAULT_PROVIDER_ID: ProviderId = "openai";
export const DEFAULT_MODEL: ModelId = ""; // Empty - filled with the provider's recommended model
