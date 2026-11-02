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

// maxgfr.github.io is one origin for every project page of the account, so
// they share localStorage, sessionStorage and IndexedDB: every name carries
// the app's name.

/** Non-secret preferences, in localStorage. */
const SETTINGS_KEY = "csv-ai-analyzer:settings";
/** IndexedDB database of the encryption key and a remembered API key. */
const DB_NAME = "csv-ai-analyzer-secrets";
/** Where older versions kept the settings and the encryption key; moved once. */
const LEGACY_SETTINGS_KEY = "csv-ai-settings";
const LEGACY_DB_NAME = "csv-ai-secrets";
/** Where v1.16 kept the API key in clear text (sessionStorage, or localStorage when remembered). */
const CLEAR_KEY_KEY = "csv-ai-api-key";

// The API key is never stored in clear text: AES-GCM under a non-extractable
// CryptoKey kept in IndexedDB (see llm-connect's secureStorage)
const createStorage = () =>
  secureStorage({ prefsKey: SETTINGS_KEY, dbName: DB_NAME });
let storage = createStorage();
/** Whether the last save could be read back from storage. */
let lastSaveKept = true;

/** Drops the decrypted key kept in memory, as a page reload would. */
export function resetSettingsCacheForTests() {
  storage = createStorage();
  lastSaveKept = true;
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

function write(kind: Kind, key: string, value: string) {
  try {
    if (typeof window !== "undefined") window[kind].setItem(key, value);
  } catch {
    // Full or blocked
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ============ Older names ============
// Decrypt with the old key, save again (encrypted) under the new names, and
// erase the old copy once the new one reads back. The old preferences are
// removed first so a nearly full localStorage has room for the new ones, and
// put back if the new copy was not kept: the move is retried on the next load.

const legacyStorage = () =>
  secureStorage({ prefsKey: LEGACY_SETTINGS_KEY, dbName: LEGACY_DB_NAME });

async function migrateLegacyNames() {
  const raw = read("localStorage", LEGACY_SETTINGS_KEY);
  if (raw === null || read("localStorage", SETTINGS_KEY) !== null) return;
  const legacy = legacyStorage();
  const saved = (await legacy.loadDraft?.()) as StoredSettings | null;
  if (!saved) return;
  remove("localStorage", LEGACY_SETTINGS_KEY);
  if (
    await saveApiSettings({ ...saved, rememberKey: saved.rememberKey === true })
  ) {
    await legacy.clear();
    await deleteDatabase(LEGACY_DB_NAME);
  } else {
    remove("localStorage", SETTINGS_KEY);
    write("localStorage", LEGACY_SETTINGS_KEY, raw);
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
  if (
    !read("localStorage", SETTINGS_KEY) &&
    !read("localStorage", LEGACY_SETTINGS_KEY)
  ) {
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

/** Saves the settings; false when the browser did not keep them (storage full or blocked). */
export const saveApiSettings = async (
  settings: StoredSettings,
): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  const { rememberKey, ...rest } = settings;
  const language = rest.language ? toLanguageCode(rest.language) : undefined;
  const next = { ...rest, language };
  await storage.save(next, { rememberKey: !!rememberKey });
  // llm-connect 1.x ignores a refused write: read it back, the key included.
  const stored = await createStorage()
    .loadDraft?.()
    .catch(() => null);
  const { apiKey, ...prefs } = next;
  lastSaveKept =
    stored?.apiKey === apiKey &&
    read("localStorage", SETTINGS_KEY) ===
      JSON.stringify({ ...prefs, rememberKey: !!rememberKey });
  return lastSaveKept;
};

/** Whether the last save was kept; when false the settings only last for this page. */
export const wereSettingsKept = () => lastSaveKept;

/** Saved settings that can call a model, or null. */
export const loadApiSettings = async (): Promise<StoredSettings | null> => {
  if (typeof window === "undefined") return null;
  await migrateLegacyCookies();
  await migrateLegacyNames();
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
  // A copy under the old names, if moving it never succeeded
  if (read("localStorage", LEGACY_SETTINGS_KEY) !== null) {
    await legacyStorage().clear();
    await deleteDatabase(LEGACY_DB_NAME);
  }
};

/** These settings as llm-connect's settings storage: same keys, migrations included. */
export const apiSettingsStorage: SettingsStorage = {
  load: loadApiSettings,
  save: async (settings, { rememberKey }) => {
    await saveApiSettings({ ...settings, rememberKey });
  },
  clear: clearApiSettings,
};
