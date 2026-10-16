// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiSettingsStorage,
  clearApiSettings,
  loadApiSettings,
  resetSettingsCacheForTests,
  saveApiSettings,
  type StoredSettings,
} from "./storage";

const base: StoredSettings = {
  apiKey: "sk-test",
  model: "gpt-5-mini",
  providerId: "openai",
  language: "fr",
};

const cookieNames = () =>
  document.cookie
    .split(";")
    .map((c) => c.split("=")[0]!.trim())
    .filter(Boolean);

/** Everything IndexedDB holds for the app. */
function readSecrets(): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("csv-ai-secrets");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("kv")) {
        db.close();
        resolve([]);
        return;
      }
      const request = db
        .transaction("kv", "readonly")
        .objectStore("kv")
        .getAll();
      request.onsuccess = () => {
        db.close();
        resolve(request.result as unknown[]);
      };
      request.onerror = () => reject(request.error);
    };
  });
}

/** Whether the key can be read in clear anywhere the browser keeps data. */
async function keyInClear(key: string) {
  const webStorage = [localStorage, sessionStorage]
    .flatMap((storage) =>
      Array.from({ length: storage.length }, (_, i) =>
        storage.getItem(storage.key(i)!),
      ),
    )
    .join("\n");
  const secrets = (await readSecrets()).filter(
    (v) => !(v instanceof CryptoKey),
  );
  const bytes = secrets
    .map((v) =>
      new TextDecoder().decode((v as { ciphertext: ArrayBuffer }).ciphertext),
    )
    .join("\n");
  return [document.cookie, webStorage, JSON.stringify(secrets), bytes].some(
    (text) => text.includes(key),
  );
}

/** A page reload: the decrypted key is no longer in memory. */
const reload = () => resetSettingsCacheForTests();

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  reload();
});

afterEach(async () => {
  await clearApiSettings();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("API settings storage", () => {
  it("keeps the key encrypted for the tab unless remembered", async () => {
    await saveApiSettings(base);
    expect(await keyInClear("sk-test")).toBe(false);
    expect(sessionStorage.getItem("csv-ai-settings-key")).toContain(
      "ciphertext",
    );
    reload();
    expect(await loadApiSettings()).toMatchObject({
      ...base,
      rememberKey: false,
    });

    // A new tab has an empty sessionStorage: the key is forgotten
    sessionStorage.clear();
    reload();
    expect(await loadApiSettings()).toBeNull();
  });

  it("keeps a remembered key encrypted in IndexedDB, under a non-extractable key", async () => {
    await saveApiSettings({ ...base, rememberKey: true });
    expect(await keyInClear("sk-test")).toBe(false);
    expect(sessionStorage.length).toBe(0);
    const cryptoKey = (await readSecrets()).find(
      (v) => v instanceof CryptoKey,
    ) as CryptoKey;
    expect(cryptoKey.extractable).toBe(false);
    reload();
    expect(await loadApiSettings()).toMatchObject({
      apiKey: "sk-test",
      rememberKey: true,
    });
  });

  it("never writes cookies", async () => {
    await saveApiSettings({ ...base, rememberKey: true });
    expect(document.cookie).toBe("");
  });

  it("re-encrypts a key v1.16 kept in clear text, with the same remember choice", async () => {
    localStorage.setItem(
      "csv-ai-settings",
      JSON.stringify({
        model: "claude-x",
        providerId: "anthropic",
        language: "de",
        rememberKey: true,
      }),
    );
    localStorage.setItem("csv-ai-api-key", "sk-remembered");
    expect(await loadApiSettings()).toMatchObject({
      apiKey: "sk-remembered",
      model: "claude-x",
      language: "de",
      rememberKey: true,
    });
    expect(localStorage.getItem("csv-ai-api-key")).toBeNull();
    expect(await keyInClear("sk-remembered")).toBe(false);
    reload();
    expect(await loadApiSettings()).toMatchObject({ apiKey: "sk-remembered" });

    sessionStorage.setItem("csv-ai-api-key", "sk-tab");
    expect(await loadApiSettings()).toMatchObject({
      apiKey: "sk-tab",
      rememberKey: false,
    });
    expect(sessionStorage.getItem("csv-ai-api-key")).toBeNull();
    expect(await keyInClear("sk-tab")).toBe(false);
  });

  it("migrates legacy cookies once and deletes them", async () => {
    document.cookie = "csv-ai-api-key=sk-legacy";
    document.cookie = "csv-ai-model=claude-x";
    document.cookie = "csv-ai-provider=anthropic";
    document.cookie = "csv-ai-language=de";
    expect(await loadApiSettings()).toMatchObject({
      apiKey: "sk-legacy",
      model: "claude-x",
      providerId: "anthropic",
      language: "de",
      rememberKey: true,
    });
    expect(cookieNames().filter((n) => n.startsWith("csv-ai"))).toEqual([]);
    expect(await keyInClear("sk-legacy")).toBe(false);
    reload();
    expect(await loadApiSettings()).toMatchObject({ apiKey: "sk-legacy" });
  });

  it("falls back to a known language and ignores corrupted preferences", async () => {
    await saveApiSettings(base);
    const prefs = JSON.parse(localStorage.getItem("csv-ai-settings")!);
    localStorage.setItem(
      "csv-ai-settings",
      JSON.stringify({ ...prefs, language: "xx", model: 42 }),
    );
    reload();
    const settings = await loadApiSettings();
    expect(settings?.language).toBe("en");
    expect(settings?.model).toBe("");
  });

  it("clears the preferences, the ciphertext and the encryption key", async () => {
    await saveApiSettings({ ...base, rememberKey: true });
    await clearApiSettings();
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(await readSecrets()).toEqual([]);
    expect(await loadApiSettings()).toBeNull();
  });

  it("survives storage that throws", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await expect(saveApiSettings(base)).resolves.toBeUndefined();
    reload();
    expect(await loadApiSettings()).toBeNull();
  });
});

describe("llm-connect storage adapter", () => {
  it("saves with the dialog's remember choice under the same keys", async () => {
    await apiSettingsStorage.save(base, { rememberKey: true });
    expect(JSON.parse(localStorage.getItem("csv-ai-settings")!)).toMatchObject({
      language: "fr",
      rememberKey: true,
    });
    expect(await apiSettingsStorage.load()).toMatchObject({
      ...base,
      rememberKey: true,
    });

    await apiSettingsStorage.clear();
    expect(localStorage.getItem("csv-ai-settings")).toBeNull();
    expect(await apiSettingsStorage.load()).toBeNull();
  });
});
