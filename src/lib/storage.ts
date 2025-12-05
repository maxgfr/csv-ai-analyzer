import Cookies from "js-cookie";
import { DEFAULT_MODEL, getBrowserLanguage, type ModelId, type LanguageCode } from "./ai-models";

export interface StoredSettings {
  apiKey: string;
  model: ModelId;
  language: LanguageCode;
}

export interface CSVStoredSettings {
  delimiter: string;
  hasHeader: boolean;
  encoding: string;
  skipEmptyLines: boolean;
}

const API_KEY_COOKIE = "csv-ai-api-key";
const MODEL_COOKIE = "csv-ai-model";
const LANGUAGE_COOKIE = "csv-ai-language";
const CSV_SETTINGS_KEY = "csv-ai-analyzer-csv-settings";

// Cookie options for security
const COOKIE_OPTIONS: Cookies.CookieAttributes = {
  expires: 365, // 1 year
  secure: true, // Only sent over HTTPS
  sameSite: "strict", // Prevent CSRF
};

export const saveApiSettings = (settings: StoredSettings): void => {
  if (typeof window !== "undefined") {
    Cookies.set(API_KEY_COOKIE, settings.apiKey, COOKIE_OPTIONS);
    Cookies.set(MODEL_COOKIE, settings.model, COOKIE_OPTIONS);
    Cookies.set(LANGUAGE_COOKIE, settings.language, COOKIE_OPTIONS);
  }
};

export const loadApiSettings = (): StoredSettings | null => {
  if (typeof window !== "undefined") {
    const apiKey = Cookies.get(API_KEY_COOKIE);
    const model = (Cookies.get(MODEL_COOKIE) as ModelId) || DEFAULT_MODEL;
    const language = (Cookies.get(LANGUAGE_COOKIE) as LanguageCode) || getBrowserLanguage();

    if (apiKey) {
      return { apiKey, model, language };
    }
  }
  return null;
};

export const clearApiSettings = (): void => {
  if (typeof window !== "undefined") {
    Cookies.remove(API_KEY_COOKIE);
    Cookies.remove(MODEL_COOKIE);
    Cookies.remove(LANGUAGE_COOKIE);
  }
};

export const saveCsvSettings = (settings: CSVStoredSettings): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(CSV_SETTINGS_KEY, JSON.stringify(settings));
  }
};

export const loadCsvSettings = (): CSVStoredSettings | null => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(CSV_SETTINGS_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as CSVStoredSettings;
      } catch {
        return null;
      }
    }
  }
  return null;
};
