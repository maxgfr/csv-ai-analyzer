export type ProviderId = string;

// Allow arbitrary model IDs (including vendor-specific names) — keep typed known IDs but accept custom strings
export type ModelId = string;

// Default provider when nothing is selected yet; its model comes from the catalog's defaultModel
export const DEFAULT_PROVIDER_ID: ProviderId = "openai";
export const DEFAULT_MODEL: ModelId = ""; // Empty - filled with the provider's recommended model

// Supported languages for LLM output
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "es", name: "Español" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "nl", name: "Nederlands" },
  { code: "ja", name: "日本語" },
  { code: "zh", name: "中文" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

// Get browser language or default to English
export function getBrowserLanguage(): LanguageCode {
  if (typeof navigator === "undefined") return "en";

  const browserLang = navigator.language.split("-")[0];
  const supported = SUPPORTED_LANGUAGES.find((l) => l.code === browserLang);
  return supported ? supported.code : "en";
}
