export type ProviderId = "openai";

// Available models - OpenAI GPT-5 series
export const AVAILABLE_MODELS = [
  { id: "gpt-5.1", name: "GPT-5.1", description: "Most capable model for complex analysis" },
  { id: "gpt-5-mini", name: "GPT-5 Mini", description: "Balanced performance and speed" },
  { id: "gpt-5-nano", name: "GPT-5 Nano", description: "Fast and cost-effective" },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]["id"];

// Default model
export const DEFAULT_MODEL: ModelId = "gpt-5-mini";

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

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];

// Get browser language or default to English
export function getBrowserLanguage(): LanguageCode {
  if (typeof navigator === "undefined") return "en";

  const browserLang = navigator.language.split("-")[0];
  const supported = SUPPORTED_LANGUAGES.find(l => l.code === browserLang);
  return supported ? supported.code : "en";
}
