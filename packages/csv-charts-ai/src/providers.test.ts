import { describe, it, expect, beforeEach, vi } from "vitest";
import type { LanguageModel } from "ai";
import {
  registerProvider,
  registerProviders,
  fromSDK,
  getProvider,
  hasProvider,
  clearProviders,
  requireProvider,
} from "./providers";
import type { ProviderConfig } from "./providers";

/** Create a fake LanguageModel for testing */
function mockLanguageModel(model: string): LanguageModel {
  return {
    doGenerate: vi.fn(),
    modelId: model,
    provider: "test",
  } as unknown as LanguageModel;
}

describe("provider registry", () => {
  beforeEach(() => {
    clearProviders();
  });

  describe("registerProvider / getProvider / hasProvider", () => {
    it("registers and retrieves a provider by name", () => {
      const factory = (config: ProviderConfig) =>
        mockLanguageModel(config.model);
      registerProvider("test", factory);

      expect(hasProvider("test")).toBe(true);
      expect(getProvider("test")).toBe(factory);
    });

    it("resolves npm aliases automatically", () => {
      const factory = (config: ProviderConfig) =>
        mockLanguageModel(config.model);
      registerProvider("@ai-sdk/openai", factory);

      expect(hasProvider("openai")).toBe(true);
      expect(hasProvider("@ai-sdk/openai")).toBe(true);
      expect(getProvider("openai")).toBeDefined();
    });

    it("returns undefined for unregistered providers", () => {
      expect(getProvider("nonexistent")).toBeUndefined();
      expect(hasProvider("nonexistent")).toBe(false);
    });

    it("overwrites an existing provider", () => {
      const factory1 = (config: ProviderConfig) =>
        mockLanguageModel("v1-" + config.model);
      const factory2 = (config: ProviderConfig) =>
        mockLanguageModel("v2-" + config.model);

      registerProvider("test", factory1);
      registerProvider("test", factory2);

      const model = getProvider("test")!({
        apiKey: "",
        model: "m",
      });
      expect((model as { modelId: string }).modelId).toBe("v2-m");
    });
  });

  describe("registerProviders", () => {
    it("registers multiple providers at once", () => {
      registerProviders({
        openai: (config) => mockLanguageModel(config.model),
        anthropic: (config) => mockLanguageModel(config.model),
      });

      expect(hasProvider("openai")).toBe(true);
      expect(hasProvider("anthropic")).toBe(true);
    });
  });

  describe("clearProviders", () => {
    it("removes all registered providers", () => {
      registerProvider("openai", (config) => mockLanguageModel(config.model));
      registerProvider("anthropic", (config) =>
        mockLanguageModel(config.model),
      );

      clearProviders();

      expect(hasProvider("openai")).toBe(false);
      expect(hasProvider("anthropic")).toBe(false);
    });
  });

  describe("requireProvider", () => {
    it("returns the provider when registered", () => {
      const factory = (config: ProviderConfig) =>
        mockLanguageModel(config.model);
      registerProvider("openai", factory);

      expect(requireProvider("openai")).toBe(factory);
    });

    it("throws with helpful message for known providers", () => {
      expect(() => requireProvider("openai")).toThrow(
        'Provider "openai" is not registered',
      );
      expect(() => requireProvider("openai")).toThrow("@ai-sdk/openai");
    });

    it("throws with generic message for unknown providers", () => {
      expect(() => requireProvider("my-custom")).toThrow(
        'Provider "my-custom" is not registered',
      );
    });

    it("resolves npm aliases before lookup", () => {
      registerProvider("anthropic", (config) =>
        mockLanguageModel(config.model),
      );
      expect(() => requireProvider("@ai-sdk/anthropic")).not.toThrow();
    });
  });

  describe("fromSDK", () => {
    it("wraps an AI SDK creator into a ProviderFactory", () => {
      // Simulate an @ai-sdk/* createXxx function:
      // createXxx(options) => (modelName) => LanguageModel
      const fakeCreateSDK = vi.fn(
        (options: { apiKey?: string; baseURL?: string }) => {
          return (model: string) =>
            mockLanguageModel(`${model}@${options.apiKey}`);
        },
      );

      const factory = fromSDK(fakeCreateSDK);
      const model = factory({ apiKey: "key-123", model: "gpt-4o" });

      expect(fakeCreateSDK).toHaveBeenCalledWith({ apiKey: "key-123" });
      expect((model as { modelId: string }).modelId).toBe("gpt-4o@key-123");
    });

    it("forwards baseURL and headers to the SDK creator", () => {
      const fakeCreateSDK = vi.fn(
        (_options: {
          apiKey?: string;
          baseURL?: string;
          headers?: Record<string, string>;
        }) => {
          return (model: string) => mockLanguageModel(model);
        },
      );

      const factory = fromSDK(fakeCreateSDK);
      factory({
        apiKey: "key",
        model: "m",
        baseURL: "http://localhost:11434",
        headers: { "x-custom": "true" },
      });

      expect(fakeCreateSDK).toHaveBeenCalledWith({
        apiKey: "key",
        baseURL: "http://localhost:11434",
        headers: { "x-custom": "true" },
      });
    });

    it("omits undefined optional fields", () => {
      const fakeCreateSDK = vi.fn((_options: Record<string, unknown>) => {
        return (model: string) => mockLanguageModel(model);
      });

      const factory = fromSDK(fakeCreateSDK);
      factory({ apiKey: "key", model: "m" });

      expect(fakeCreateSDK).toHaveBeenCalledWith({ apiKey: "key" });
      const callArgs = fakeCreateSDK.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect("baseURL" in callArgs).toBe(false);
      expect("headers" in callArgs).toBe(false);
    });
  });
});

it("uses Chat Completions for OpenAI-compatible base URLs", () => {
  const responses = vi.fn();
  const chat = vi.fn().mockReturnValue({ modelId: "local-chat" });
  const provider = Object.assign(responses, { chat });
  const factory = fromSDK(() => provider);
  factory({
    apiKey: "",
    model: "local-model",
    baseURL: "http://localhost:11434/v1",
  });
  expect(chat).toHaveBeenCalledWith("local-model");
  expect(responses).not.toHaveBeenCalled();
});
