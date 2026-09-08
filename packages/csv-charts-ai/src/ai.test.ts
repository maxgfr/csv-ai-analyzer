import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  summarizeTabularData,
  getAIErrorMessage,
  AIConfigSchema,
  TabularDataSchema,
  createModel,
  suggestCharts,
  suggestCustomChart,
  repairChart,
} from "./ai";
import { registerProvider, clearProviders } from "./providers";
import type { LanguageModel } from "ai";
import type { TabularData } from "./types";

// Mock the ai SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

/** Create a fake LanguageModel for testing */
function mockLanguageModel(model: string): LanguageModel {
  return {
    doGenerate: vi.fn(),
    modelId: model,
    provider: "openai",
  } as unknown as LanguageModel;
}

const sampleData: TabularData = {
  headers: ["name", "age", "salary"],
  rows: [
    ["Alice", "30", "75000"],
    ["Bob", "25", "62000"],
    ["Charlie", "35", "88000"],
  ],
  columns: [
    { name: "name", type: "string", index: 0 },
    { name: "age", type: "number", index: 1 },
    { name: "salary", type: "number", index: 2 },
  ],
  rowCount: 3,
};

describe("summarizeTabularData", () => {
  it("includes dataset dimensions", () => {
    const summary = summarizeTabularData(sampleData);
    expect(summary).toContain("3 rows");
    expect(summary).toContain("3 columns");
  });

  it("includes column names", () => {
    const summary = summarizeTabularData(sampleData);
    expect(summary).toContain("name, age, salary");
  });

  it("computes numeric stats for number columns", () => {
    const summary = summarizeTabularData(sampleData);
    expect(summary).toContain("salary (number)");
    expect(summary).toContain("min=62000");
    expect(summary).toContain("max=88000");
    expect(summary).toContain("avg=75000.00");
    expect(summary).toContain("3 values");
  });

  it("shows distinct values for string columns", () => {
    const summary = summarizeTabularData(sampleData);
    expect(summary).toContain("name (string)");
    expect(summary).toContain("3 distinct values");
    expect(summary).toContain("Alice");
  });

  it("handles empty dataset", () => {
    const empty: TabularData = {
      headers: ["a"],
      rows: [],
      columns: [{ name: "a", type: "string", index: 0 }],
      rowCount: 0,
    };
    const summary = summarizeTabularData(empty);
    expect(summary).toContain("0 rows");
  });

  it("handles large numeric arrays without stack overflow", () => {
    // Create a dataset with 100k rows — would crash with Math.min(...nums)
    const bigRows = Array.from({ length: 100000 }, (_, i) => [String(i)]);
    const bigData: TabularData = {
      headers: ["value"],
      rows: bigRows,
      columns: [{ name: "value", type: "number", index: 0 }],
      rowCount: 100000,
    };

    // Should not throw
    expect(() => summarizeTabularData(bigData)).not.toThrow();
    const summary = summarizeTabularData(bigData);
    expect(summary).toContain("min=0");
    expect(summary).toContain("max=99999");
  });

  it("handles columns with no valid numeric values", () => {
    const data: TabularData = {
      headers: ["value"],
      rows: [["abc"], ["def"]],
      columns: [{ name: "value", type: "number", index: 0 }],
      rowCount: 2,
    };
    const summary = summarizeTabularData(data);
    expect(summary).toContain("no valid numeric values");
  });
});

describe("getAIErrorMessage", () => {
  it("detects rate limit errors", () => {
    expect(getAIErrorMessage(new Error("Rate limit exceeded"))).toBe(
      "Rate limit exceeded. Please wait a moment and try again.",
    );
    expect(getAIErrorMessage(new Error("status 429"))).toBe(
      "Rate limit exceeded. Please wait a moment and try again.",
    );
  });

  it("detects auth errors", () => {
    expect(getAIErrorMessage(new Error("Unauthorized"))).toBe(
      "Invalid API key. Please check your API key configuration.",
    );
    expect(getAIErrorMessage(new Error("401 error"))).toBe(
      "Invalid API key. Please check your API key configuration.",
    );
    expect(getAIErrorMessage(new Error("invalid_api_key"))).toBe(
      "Invalid API key. Please check your API key configuration.",
    );
  });

  it("detects quota errors", () => {
    expect(getAIErrorMessage(new Error("insufficient_quota"))).toBe(
      "API quota exceeded or billing issue. Please check your account status.",
    );
    expect(getAIErrorMessage(new Error("billing issue"))).toBe(
      "API quota exceeded or billing issue. Please check your account status.",
    );
  });

  it("detects network errors", () => {
    expect(getAIErrorMessage(new Error("network error"))).toBe(
      "Network error: the AI provider could not be reached. Check your connection and API URL. If the provider blocks browser requests (CORS), use a server relay you control or a provider that supports browser access. This error does not verify your API key.",
    );
    expect(getAIErrorMessage(new Error("ECONNREFUSED"))).toBe(
      "Network error: the AI provider could not be reached. Check your connection and API URL. If the provider blocks browser requests (CORS), use a server relay you control or a provider that supports browser access. This error does not verify your API key.",
    );
    expect(getAIErrorMessage(new Error("fetch failed"))).toBe(
      "Network error: the AI provider could not be reached. Check your connection and API URL. If the provider blocks browser requests (CORS), use a server relay you control or a provider that supports browser access. This error does not verify your API key.",
    );
  });

  it.each(["Failed to fetch", "Load failed"])(
    "explains browser error '%s' without calling the key invalid",
    (error) => {
      const message = getAIErrorMessage(new TypeError(error));
      expect(message).toContain("CORS");
      expect(message).toContain("server relay");
      expect(message).not.toContain("Invalid API key");
    },
  );

  it("detects model not found errors", () => {
    expect(getAIErrorMessage(new Error("model not found"))).toBe(
      "Model not available. Please select a different model.",
    );
    expect(getAIErrorMessage(new Error("model does not exist"))).toBe(
      "Model not available. Please select a different model.",
    );
  });

  it("returns original message for unknown Error", () => {
    expect(getAIErrorMessage(new Error("Something specific"))).toBe(
      "Something specific",
    );
  });

  it("returns generic message for non-Error", () => {
    expect(getAIErrorMessage("string error")).toBe(
      "An unexpected error occurred. Please try again.",
    );
    expect(getAIErrorMessage(null)).toBe(
      "An unexpected error occurred. Please try again.",
    );
    expect(getAIErrorMessage(42)).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });
});

describe("AIConfigSchema", () => {
  it("validates a minimal OpenAI config", () => {
    const result = AIConfigSchema.parse({
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(result.apiKey).toBe("sk-test");
    expect(result.model).toBe("gpt-4o");
    expect(result.provider).toBe("openai"); // default
  });

  it("validates config with all fields", () => {
    const result = AIConfigSchema.parse({
      apiKey: "sk-test",
      model: "claude-sonnet-4-20250514",
      baseURL: "https://api.example.com",
      provider: "anthropic",
    });
    expect(result.provider).toBe("anthropic");
    expect(result.baseURL).toBe("https://api.example.com");
  });

  it("rejects missing apiKey", () => {
    expect(() => AIConfigSchema.parse({ model: "gpt-4o" })).toThrow();
  });

  it("rejects missing model", () => {
    expect(() => AIConfigSchema.parse({ apiKey: "sk-test" })).toThrow();
  });

  it("accepts any string as provider", () => {
    const result = AIConfigSchema.parse({
      apiKey: "sk-test",
      model: "gpt-4o",
      provider: "my-custom-provider",
    });
    expect(result.provider).toBe("my-custom-provider");
  });
});

describe("TabularDataSchema", () => {
  it("validates correct TabularData", () => {
    expect(() => TabularDataSchema.parse(sampleData)).not.toThrow();
  });

  it("rejects empty headers", () => {
    expect(() =>
      TabularDataSchema.parse({
        headers: [],
        rows: [],
        columns: [],
        rowCount: 0,
      }),
    ).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => TabularDataSchema.parse({ headers: ["a"] })).toThrow();
  });
});

describe("createModel", () => {
  beforeEach(() => {
    clearProviders();
    registerProvider("openai", (config) => mockLanguageModel(config.model));
  });

  it("creates model via registered provider", () => {
    const model = createModel({
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(model).toBeDefined();
    expect((model as { modelId: string }).modelId).toBe("gpt-4o");
  });

  it("creates model with custom baseURL", () => {
    const model = createModel({
      apiKey: "",
      model: "llama3",
      baseURL: "http://localhost:11434/v1",
    });
    expect(model).toBeDefined();
  });

  it("throws when provider is not registered", () => {
    expect(() =>
      createModel({
        apiKey: "sk-test",
        model: "claude-sonnet-4-20250514",
        provider: "unregistered",
      }),
    ).toThrow('Provider "unregistered" is not registered');
  });
});

describe("suggestCharts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviders();
    registerProvider("openai", (config) => mockLanguageModel(config.model));
  });

  it("validates input data", async () => {
    const invalidData = {
      headers: [],
      rows: [],
      columns: [],
      rowCount: 0,
    } as TabularData;

    await expect(
      suggestCharts({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: invalidData,
      }),
    ).rejects.toThrow();
  });

  it("returns mapped ChartConfig array on success", async () => {
    const { generateObject } = await import("ai");
    const mockedGenerate = vi.mocked(generateObject);
    mockedGenerate.mockResolvedValueOnce({
      object: {
        charts: [
          {
            type: "bar",
            title: "Salary by Name",
            description: "Shows salary distribution",
            xColumn: "name",
            yColumn: "salary",
            aggregation: "sum",
            reasoning: "Bar chart is ideal for categorical comparison",
          },
        ],
      },
      finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      warnings: undefined,
      request: {} as never,
      response: {} as never,
      logprobs: undefined,
      toJsonResponse: (() => new Response()) as never,
      providerMetadata: undefined,
    });

    const charts = await suggestCharts({
      model: { apiKey: "sk-test", model: "gpt-4o" },
      data: sampleData,
    });

    expect(charts).toHaveLength(1);
    expect(charts[0]?.type).toBe("bar");
    expect(charts[0]?.title).toBe("Salary by Name");
    expect(charts[0]?.xAxis).toBe("name");
    expect(charts[0]?.yAxis).toBe("salary");
    expect(charts[0]?.aggregation).toBe("sum");
    expect(charts[0]?.dataConfig?.xColumn).toBe("name");
  });

  it("passes signal through to generateObject", async () => {
    const { generateObject } = await import("ai");
    const mockedGenerate = vi.mocked(generateObject);
    mockedGenerate.mockResolvedValueOnce({
      object: { charts: [] },
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      warnings: undefined,
      request: {} as never,
      response: {} as never,
      logprobs: undefined,
      toJsonResponse: (() => new Response()) as never,
      providerMetadata: undefined,
    });

    const controller = new AbortController();
    await suggestCharts({
      model: { apiKey: "sk-test", model: "gpt-4o" },
      data: sampleData,
      signal: controller.signal,
    });

    expect(mockedGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    );
  });
});

describe("suggestCustomChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviders();
    registerProvider("openai", (config) => mockLanguageModel(config.model));
  });

  it("returns a single ChartConfig on success", async () => {
    const { generateObject } = await import("ai");
    const mockedGenerate = vi.mocked(generateObject);
    mockedGenerate.mockResolvedValueOnce({
      object: {
        chart: {
          type: "line",
          title: "Age Trend",
          description: "Age over names",
          xColumn: "name",
          yColumn: "age",
          aggregation: "none",
          reasoning: "Line to show progression",
        },
      },
      finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      warnings: undefined,
      request: {} as never,
      response: {} as never,
      logprobs: undefined,
      toJsonResponse: (() => new Response()) as never,
      providerMetadata: undefined,
    });

    const chart = await suggestCustomChart({
      model: { apiKey: "sk-test", model: "gpt-4o" },
      data: sampleData,
      prompt: "Show me a line chart of age",
    });

    expect(chart).not.toBeNull();
    expect(chart?.type).toBe("line");
    expect(chart?.id).toContain("chart-custom-");
  });
});

describe("repairChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviders();
    registerProvider("openai", (config) => mockLanguageModel(config.model));
  });

  it("returns a fixed ChartConfig preserving the original id", async () => {
    const { generateObject } = await import("ai");
    const mockedGenerate = vi.mocked(generateObject);
    mockedGenerate.mockResolvedValueOnce({
      object: {
        chart: {
          type: "bar",
          title: "Fixed Chart",
          description: "Repaired",
          xColumn: "name",
          yColumn: "salary",
          aggregation: "sum",
          reasoning: "Fixed column reference",
        },
      },
      finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      warnings: undefined,
      request: {} as never,
      response: {} as never,
      logprobs: undefined,
      toJsonResponse: (() => new Response()) as never,
      providerMetadata: undefined,
    });

    const fixed = await repairChart({
      model: { apiKey: "sk-test", model: "gpt-4o" },
      failedChart: {
        id: "chart-original-123",
        type: "bar",
        title: "Broken",
        description: "",
        xAxis: "nonexistent",
        yAxis: "salary",
        aggregation: "sum",
      },
      columns: ["name", "age", "salary"],
      errorContext: "Column 'nonexistent' does not exist",
    });

    expect(fixed?.id).toBe("chart-original-123");
    expect(fixed?.xAxis).toBe("name");
  });
});
