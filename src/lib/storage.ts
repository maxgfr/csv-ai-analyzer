import Cookies from "js-cookie";
import {
  browserLanguage,
  secureStorage,
  toLanguageCode,
  type LlmSettings,
  type SettingsStorage,
} from "llm-connect";
import { DEFAULT_MODEL, DEFAULT_PROVIDER_ID } from "./ai-models";

export interface StoredSettings extends LlmSettings {
  /**
   * Keep the API key on this device (encrypted in IndexedDB). Otherwise it is
   * kept encrypted in sessionStorage and forgotten when the tab closes.
   */
  rememberKey?: boolean;
}

/** Non-secret preferences, in localStorage. */
const SETTINGS_KEY = "csv-ai-settings";
/** IndexedDB database of the encryption key and a remembered API key. */
const DB_NAME = "csv-ai-secrets";
/** Where v1.16 kept the API key in clear text (sessionStorage, or localStorage when remembered). */
const CLEAR_KEY_KEY = "csv-ai-api-key";

// The API key is never stored in clear text: AES-GCM under a non-extractable
// CryptoKey kept in IndexedDB (see llm-connect's secureStorage)
const createStorage = () =>
  secureStorage({ prefsKey: SETTINGS_KEY, dbName: DB_NAME });
let storage = createStorage();

/** Drops the decrypted key kept in memory, as a page reload would. */
export function resetSettingsCacheForTests() {
  storage = createStorage();
}

// ============ Safe Web Storage access ============
// Storage can be missing or throw (private mode, blocked site data, quota).

type Kind = "localStorage" | "sessionStorage";

function read(kind: Kind, key: string) {
  try {
    return typeof window === "undefined" ? null : window[kind].getItem(key);
  } catch {
    return null;
  }
}

function remove(kind: Kind, key: string) {
  try {
    if (typeof window !== "undefined") window[kind].removeItem(key);
  } catch {
    // Nothing to clean up
  }
}

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

async function migrateLegacyCookies() {
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
    await saveApiSettings({
      apiKey,
      model: values.model ?? DEFAULT_MODEL,
      providerId: values.providerId ?? DEFAULT_PROVIDER_ID,
      providerName: values.providerName,
      providerNpm: values.providerNpm,
      providerApi: values.providerApi,
      language: values.language,
      customEndpoint: values.customEndpoint,
      customModel: values.customModel,
      // People who already saved a key stay signed in after the upgrade
      rememberKey: !!apiKey,
    });
  }
  for (const name of Object.values(LEGACY_COOKIES)) removeLegacyCookie(name);
}

// ============ Clear-text key (v1.16) ============
// Re-encrypt it with the same "remember" choice, then delete the clear copy.

async function migrateClearTextKey() {
  const session = read("sessionStorage", CLEAR_KEY_KEY);
  const local = read("localStorage", CLEAR_KEY_KEY);
  const apiKey = session ?? local;
  if (apiKey === null) return;
  const saved = await storage.loadDraft?.();
  await saveApiSettings({
    ...(saved ?? { model: DEFAULT_MODEL, providerId: DEFAULT_PROVIDER_ID }),
    apiKey,
    rememberKey: session === null,
  });
  remove("sessionStorage", CLEAR_KEY_KEY);
  remove("localStorage", CLEAR_KEY_KEY);
}

// ============ Public API ============

export const saveApiSettings = async (
  settings: StoredSettings,
): Promise<void> => {
  if (typeof window === "undefined") return;
  const { rememberKey, ...rest } = settings;
  const language = rest.language ? toLanguageCode(rest.language) : undefined;
  await storage.save({ ...rest, language }, { rememberKey: !!rememberKey });
};

/** Saved settings that can call a model, or null. */
export const loadApiSettings = async (): Promise<StoredSettings | null> => {
  if (typeof window === "undefined") return null;
  await migrateLegacyCookies();
  await migrateClearTextKey();
  const saved = await storage.load();
  if (!saved) return null;
  return {
    ...saved,
    providerId: saved.providerId ?? DEFAULT_PROVIDER_ID,
    language: saved.language
      ? toLanguageCode(saved.language)
      : browserLanguage(),
    rememberKey: saved.rememberKey === true,
  };
};

export const clearApiSettings = async (): Promise<void> => {
  if (typeof window === "undefined") return;
  remove("sessionStorage", CLEAR_KEY_KEY);
  remove("localStorage", CLEAR_KEY_KEY);
  for (const name of Object.values(LEGACY_COOKIES)) removeLegacyCookie(name);
  await storage.clear();
};

/** These settings as llm-connect's settings storage: same keys, migrations included. */
export const apiSettingsStorage: SettingsStorage = {
  load: loadApiSettings,
  save: (settings, { rememberKey }) =>
    saveApiSettings({ ...settings, rememberKey }),
  clear: clearApiSettings,
};
