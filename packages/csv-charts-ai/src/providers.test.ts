// The registry itself is tested in llm-connect; this checks that csv-charts-ai
// hands out the same one, so providers registered through either package serve both.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";
import * as llmConnect from "llm-connect";
import * as providers from "./providers";
import * as pkg from "./index";
import { createAppModel } from "./ai";

function mockLanguageModel(model: string): LanguageModel {
  return {
    doGenerate: vi.fn(),
    modelId: model,
    provider: "test",
  } as unknown as LanguageModel;
}

afterEach(() => llmConnect.clearProviders());

describe("provider registry", () => {
  it("re-exports llm-connect's registry functions", () => {
    for (const name of [
      "registerProvider",
      "registerProviders",
      "fromSDK",
      "getProvider",
      "hasProvider",
      "clearProviders",
      "requireProvider",
      "OPENAI_DEFAULT_BASE_URL",
    ] as const)
      expect(providers[name]).toBe(llmConnect[name]);
    for (const name of [
      "registerProvider",
      "registerProviders",
      "fromSDK",
      "getProvider",
      "hasProvider",
      "clearProviders",
    ] as const)
      expect(pkg[name]).toBe(llmConnect[name]);
  });

  it("shares one registry with llm-connect", () => {
    const factory = (config: { model: string }) =>
      mockLanguageModel(config.model);
    pkg.registerProvider("@ai-sdk/anthropic", factory);
    expect(llmConnect.getProvider("anthropic")).toBe(factory);

    llmConnect.registerProvider("my-llm", factory);
    expect(pkg.hasProvider("my-llm")).toBe(true);

    pkg.clearProviders();
    expect(llmConnect.hasProvider("anthropic")).toBe(false);
  });

  it("createAppModel calls the providers llm-connect registered", () => {
    const factory = vi.fn((config: { model: string }) =>
      mockLanguageModel(config.model),
    );
    llmConnect.registerProvider("openai", factory);
    const model = createAppModel({
      apiKey: "",
      customEndpoint: "http://localhost:11434/v1",
      customModel: "llama3.2",
    });
    expect(factory).toHaveBeenCalledWith({
      apiKey: "",
      model: "llama3.2",
      baseURL: "http://localhost:11434/v1",
    });
    expect(model).toHaveProperty("modelId", "llama3.2");
  });

  it("createAppModel names the missing provider", () => {
    expect(() =>
      createAppModel({ apiKey: "k", providerNpm: "@ai-sdk/mistral" }),
    ).toThrow('Provider "mistral" is not registered');
  });
});
