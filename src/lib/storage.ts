import Cookies from "js-cookie";
import type { SettingsStorage } from "llm-connect";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER_ID,
  SUPPORTED_LANGUAGES,
  getBrowserLanguage,
  type ModelId,
  type ProviderId,
  type LanguageCode,
} from "./ai-models";

export interface StoredSettings {
  apiKey: string;
  model: ModelId;
  providerId?: ProviderId;
  providerName?: string;
  providerNpm?: string;
  providerApi?: string;
  language: LanguageCode;
  customEndpoint?: string;
  customModel?: string;
  /**
   * Keep the API key on this device (localStorage). Otherwise it lives in
   * sessionStorage and is forgotten when the tab closes.
   */
  rememberKey?: boolean;
}

/** Non-secret preferences, in localStorage. */
const SETTINGS_KEY = "csv-ai-settings";
/** The API key: sessionStorage by default, localStorage when remembered. */
const API_KEY_KEY = "csv-ai-api-key";

// ============ Safe Web Storage access ============
// Storage can be missing or throw (private mode, blocked site data, quota).

function getStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}

function read(kind: "localStorage" | "sessionStorage", key: string) {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(
  kind: "localStorage" | "sessionStorage",
  key: string,
  value: string,
) {
  try {
    getStorage(kind)?.setItem(key, value);
  } catch {
    // Storage full or blocked: the settings only last for this page
  }
}

function remove(kind: "localStorage" | "sessionStorage", key: string) {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {
    // Nothing to clean up
  }
}

const isLanguage = (value: unknown): value is LanguageCode =>
  SUPPORTED_LANGUAGES.some((l) => l.code === value);

const optionalString = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;

// ============ Legacy cookies (before v1.16) ============
// Cookies were sent to the host with every request: migrate them once, then delete them.

const LEGACY_COOKIES = {
  apiKey: "csv-ai-api-key",
  model: "csv-ai-model",
  language: "csv-ai-language",
  providerId: "csv-ai-provider",
  providerName: "csv-ai-provider-name",
  providerNpm: "csv-ai-provider-npm",
  providerApi: "csv-ai-provider-api",
  customEndpoint: "csv-ai-custom-endpoint",
  customModel: "csv-ai-custom-model",
} as const;

/** Attributes the cookies were written with; removal must match them. */
export const LEGACY_COOKIE_ATTRIBUTES: Cookies.CookieAttributes = {
  secure: true,
  sameSite: "strict",
};

/** Delete a cookie written by an older version, with and without its original attributes. */
export function removeLegacyCookie(name: string) {
  try {
    Cookies.remove(name, LEGACY_COOKIE_ATTRIBUTES);
    Cookies.remove(name);
  } catch {
    // Cookies unavailable
  }
}

function migrateLegacyCookies() {
  let values: Partial<Record<keyof typeof LEGACY_COOKIES, string>>;
  try {
    values = Object.fromEntries(
      Object.entries(LEGACY_COOKIES)
        .map(([field, name]) => [field, Cookies.get(name)])
        .filter(([, value]) => value !== undefined),
    );
  } catch {
    return;
  }
  if (Object.keys(values).length === 0) return;
  // Only fill what the new storage does not already hold
  if (!read("localStorage", SETTINGS_KEY)) {
    const apiKey = values.apiKey ?? "";
    saveApiSettings({
      apiKey,
      model: values.model ?? DEFAULT_MODEL,
      providerId: values.providerId ?? DEFAULT_PROVIDER_ID,
      providerName: values.providerName,
      providerNpm: values.providerNpm,
      providerApi: values.providerApi,
      language: isLanguage(values.language)
        ? values.language
        : getBrowserLanguage(),
      customEndpoint: values.customEndpoint,
      customModel: values.customModel,
      // People who already saved a key stay signed in after the upgrade
      rememberKey: !!apiKey,
    });
  }
  for (const name of Object.values(LEGACY_COOKIES)) removeLegacyCookie(name);
}

// ============ Public API ============

export const saveApiSettings = (settings: StoredSettings): void => {
  if (typeof window === "undefined") return;
  const { apiKey, ...preferences } = settings;
  write(
    "localStorage",
    SETTINGS_KEY,
    JSON.stringify({ ...preferences, rememberKey: !!settings.rememberKey }),
  );
  remove("localStorage", API_KEY_KEY);
  remove("sessionStorage", API_KEY_KEY);
  if (apiKey)
    write(
      settings.rememberKey ? "localStorage" : "sessionStorage",
      API_KEY_KEY,
      apiKey,
    );
};

export const loadApiSettings = (): StoredSettings | null => {
  if (typeof window === "undefined") return null;
  migrateLegacyCookies();

  let preferences: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(
      read("localStorage", SETTINGS_KEY) ?? "{}",
    );
    if (parsed && typeof parsed === "object")
      preferences = parsed as Record<string, unknown>;
  } catch {
    // Corrupted preferences: start from the defaults
  }
  const apiKey =
    read("sessionStorage", API_KEY_KEY) ??
    read("localStorage", API_KEY_KEY) ??
    "";
  const customEndpoint = optionalString(preferences.customEndpoint);
  if (!apiKey && !customEndpoint) return null;

  return {
    apiKey,
    model: optionalString(preferences.model) ?? DEFAULT_MODEL,
    providerId: optionalString(preferences.providerId) ?? DEFAULT_PROVIDER_ID,
    providerName: optionalString(preferences.providerName),
    providerNpm: optionalString(preferences.providerNpm),
    providerApi: optionalString(preferences.providerApi),
    language: isLanguage(preferences.language)
      ? preferences.language
      : getBrowserLanguage(),
    customEndpoint,
    customModel: optionalString(preferences.customModel),
    rememberKey: preferences.rememberKey === true,
  };
};

export const clearApiSettings = (): void => {
  if (typeof window === "undefined") return;
  remove("localStorage", SETTINGS_KEY);
  remove("localStorage", API_KEY_KEY);
  remove("sessionStorage", API_KEY_KEY);
  for (const name of Object.values(LEGACY_COOKIES)) removeLegacyCookie(name);
};

/**
 * These settings as llm-connect's settings storage: the same keys, the legacy
 * cookie migration, and the response language kept with the AI settings.
 */
export const apiSettingsStorage: SettingsStorage<{ language: LanguageCode }> = {
  load: async () => loadApiSettings(),
  save: async (settings, { rememberKey }) =>
    saveApiSettings({ ...settings, rememberKey }),
  clear: async () => clearApiSettings(),
};
