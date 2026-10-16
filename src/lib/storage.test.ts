// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiSettingsStorage,
  clearApiSettings,
  loadApiSettings,
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

afterEach(() => {
  clearApiSettings();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("API settings storage", () => {
  it("keeps the key in sessionStorage unless remembered", () => {
    saveApiSettings(base);
    expect(sessionStorage.getItem("csv-ai-api-key")).toBe("sk-test");
    expect(localStorage.getItem("csv-ai-api-key")).toBeNull();
    expect(localStorage.getItem("csv-ai-settings")).not.toContain("sk-test");
    expect(loadApiSettings()).toMatchObject({ ...base, rememberKey: false });

    // A new tab has an empty sessionStorage: the key is forgotten
    sessionStorage.clear();
    expect(loadApiSettings()).toBeNull();
  });

  it("moves the key to localStorage when remembered, and back", () => {
    saveApiSettings({ ...base, rememberKey: true });
    expect(localStorage.getItem("csv-ai-api-key")).toBe("sk-test");
    expect(sessionStorage.getItem("csv-ai-api-key")).toBeNull();
    sessionStorage.clear();
    expect(loadApiSettings()).toMatchObject({ apiKey: "sk-test" });

    saveApiSettings({ ...base, rememberKey: false });
    expect(localStorage.getItem("csv-ai-api-key")).toBeNull();
    expect(sessionStorage.getItem("csv-ai-api-key")).toBe("sk-test");
  });

  it("never writes cookies", () => {
    saveApiSettings({ ...base, rememberKey: true });
    expect(document.cookie).toBe("");
  });

  it("migrates legacy cookies once and deletes them", () => {
    document.cookie = "csv-ai-api-key=sk-legacy";
    document.cookie = "csv-ai-model=claude-x";
    document.cookie = "csv-ai-provider=anthropic";
    document.cookie = "csv-ai-language=de";
    const settings = loadApiSettings();
    expect(settings).toMatchObject({
      apiKey: "sk-legacy",
      model: "claude-x",
      providerId: "anthropic",
      language: "de",
      rememberKey: true,
    });
    expect(cookieNames().filter((n) => n.startsWith("csv-ai"))).toEqual([]);
    expect(localStorage.getItem("csv-ai-api-key")).toBe("sk-legacy");
  });

  it("rejects unknown languages and corrupted preferences", () => {
    localStorage.setItem(
      "csv-ai-settings",
      JSON.stringify({ language: "xx", model: 42 }),
    );
    sessionStorage.setItem("csv-ai-api-key", "k");
    const settings = loadApiSettings();
    expect(["en", "fr", "de", "es", "it", "pt", "nl", "ja", "zh"]).toContain(
      settings?.language,
    );
    expect(settings?.model).toBe("");

    localStorage.setItem("csv-ai-settings", "{not json");
    expect(loadApiSettings()).toMatchObject({ apiKey: "k" });
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => saveApiSettings(base)).not.toThrow();
    expect(loadApiSettings()).toBeNull();
  });
});

describe("llm-connect storage adapter", () => {
  it("saves with the dialog's remember choice under the same keys", async () => {
    await apiSettingsStorage.save(base, { rememberKey: true });
    expect(localStorage.getItem("csv-ai-api-key")).toBe("sk-test");
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
