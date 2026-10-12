import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LanguageModel } from "ai";
import type { TabularData } from "./types";
import { registerProvider, clearProviders } from "./providers";

// Mock the ai SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn(),
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
  headers: ["name", "value", "city"],
  rows: [
    ["Alice", "100", "New York, NY"],
    ["Bob", "200", "Paris"],
    ['Charlie "The Great"', "300", "Berlin"],
  ],
  columns: [
    { name: "name", type: "string", index: 0 },
    { name: "value", type: "number", index: 1 },
    { name: "city", type: "string", index: 2 },
  ],
  rowCount: 3,
};

describe("analyze module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviders();
    registerProvider("openai", (config) => mockLanguageModel(config.model));
  });

  describe("summarizeData", () => {
    it("returns summary, keyInsights, and dataQuality", async () => {
      const { generateObject } = await import("ai");
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: {
          summary: "A dataset about people",
          keyInsights: ["Insight 1", "Insight 2"],
          dataQuality: "Good quality",
        },
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        warnings: undefined,
        request: {} as never,
        response: {} as never,
        logprobs: undefined,
        toJsonResponse: (() => new Response()) as never,
        providerMetadata: undefined,
      });

      const { summarizeData } = await import("./analyze");
      const result = await summarizeData({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
      });

      expect(result.summary).toBe("A dataset about people");
      expect(result.keyInsights).toHaveLength(2);
      expect(result.dataQuality).toBe("Good quality");
    });

    it("passes signal to generateObject", async () => {
      const { generateObject } = await import("ai");
      const mockedGenerate = vi.mocked(generateObject);
      mockedGenerate.mockResolvedValueOnce({
        object: {
          summary: "test",
          keyInsights: [],
          dataQuality: "ok",
        },
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
      const { summarizeData } = await import("./analyze");
      await summarizeData({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
        signal: controller.signal,
      });

      expect(mockedGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ abortSignal: controller.signal }),
      );
    });
  });

  describe("detectAnomalies", () => {
    it("returns anomaly results", async () => {
      const { generateObject } = await import("ai");
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: {
          anomalies: [
            {
              row: 1,
              column: "value",
              value: "999999",
              issue: "Outlier detected",
              severity: "high",
            },
          ],
        },
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        warnings: undefined,
        request: {} as never,
        response: {} as never,
        logprobs: undefined,
        toJsonResponse: (() => new Response()) as never,
        providerMetadata: undefined,
      });

      const { detectAnomalies } = await import("./analyze");
      const anomalies = await detectAnomalies({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
      });

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]?.severity).toBe("high");
    });

    it("properly escapes CSV fields with commas and quotes", async () => {
      const { generateObject } = await import("ai");
      const mockedGenerate = vi.mocked(generateObject);
      mockedGenerate.mockResolvedValueOnce({
        object: { anomalies: [] },
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        warnings: undefined,
        request: {} as never,
        response: {} as never,
        logprobs: undefined,
        toJsonResponse: (() => new Response()) as never,
        providerMetadata: undefined,
      });

      const { detectAnomalies } = await import("./analyze");
      await detectAnomalies({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
      });

      // detectAnomalies sends both a text summary AND a CSV section
      const callArgs = mockedGenerate.mock.calls[0]?.[0] as { prompt: string };
      const prompt = callArgs.prompt;
      // Prompt should contain the CSV section with proper escaping
      expect(prompt).toContain("Data to analyze (CSV format):");
      // "New York, NY" contains a comma, must be quoted in CSV
      expect(prompt).toContain('"New York, NY"');
      // Charlie "The Great" contains quotes, must be double-escaped
      expect(prompt).toContain('"Charlie ""The Great"""');
    });
  });

  describe("askAboutData", () => {
    it("returns text response", async () => {
      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValueOnce({
        text: "The average value is 200.",
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        warnings: undefined,
        request: {} as never,
        response: {} as never,
        logprobs: undefined,
        toolCalls: [],
        toolResults: [],
        steps: [],
        sources: [],
        files: [],
        reasoning: undefined,
        reasoningDetails: [],
        providerMetadata: undefined,
      });

      const { askAboutData } = await import("./analyze");
      const answer = await askAboutData({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
        question: "What is the average value?",
      });

      expect(answer).toBe("The average value is 200.");
    });

    it("includes conversation history in prompt", async () => {
      const { generateText } = await import("ai");
      const mockedText = vi.mocked(generateText);

      const callCountBefore = mockedText.mock.calls.length;

      mockedText.mockResolvedValueOnce({
        text: "Follow-up answer",
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        warnings: undefined,
        request: {} as never,
        response: {} as never,
        logprobs: undefined,
        toolCalls: [],
        toolResults: [],
        steps: [],
        sources: [],
        files: [],
        reasoning: undefined,
        reasoningDetails: [],
        providerMetadata: undefined,
      });

      const { askAboutData } = await import("./analyze");
      await askAboutData({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
        question: "And the max?",
        history: [{ prompt: "What is the average?", response: "200" }],
      });

      // Get the call from THIS test specifically
      const lastCall = mockedText.mock.calls[callCountBefore]?.[0] as {
        prompt: string;
      };
      expect(lastCall.prompt).toContain("Previous conversation history");
      expect(lastCall.prompt).toContain("What is the average?");
    });
  });

  describe("streamAskAboutData", () => {
    it("streams text chunks and calls onComplete", async () => {
      const { streamText } = await import("ai");
      const chunks = ["Hello", " World", "!"];

      vi.mocked(streamText).mockReturnValueOnce({
        textStream: (async function* () {
          for (const chunk of chunks) yield chunk;
        })(),
        finishReason: Promise.resolve("stop"),
        text: Promise.resolve("Hello World!"),
        usage: Promise.resolve({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }),
        warnings: Promise.resolve(undefined),
        request: Promise.resolve({} as never),
        response: Promise.resolve({} as never),
        steps: Promise.resolve([]),
        sources: Promise.resolve([]),
      } as never);

      const receivedChunks: string[] = [];
      let completedText = "";

      const { streamAskAboutData } = await import("./analyze");
      await streamAskAboutData({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
        question: "What do you see?",
        onChunk: (chunk) => receivedChunks.push(chunk),
        onComplete: (full) => {
          completedText = full;
        },
      });

      expect(receivedChunks).toEqual(["Hello", " World", "!"]);
      expect(completedText).toBe("Hello World!");
    });
  });

  describe("suggestQuestions", () => {
    it("returns suggested questions with categories", async () => {
      const { generateObject } = await import("ai");
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: {
          questions: [
            { question: "What is the trend in value?", category: "trend" },
            {
              question: "Which name has the highest value?",
              category: "comparison",
            },
            { question: "Are there outliers in value?", category: "anomaly" },
          ],
        },
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        warnings: undefined,
        request: {} as never,
        response: {} as never,
        logprobs: undefined,
        toJsonResponse: (() => new Response()) as never,
        providerMetadata: undefined,
      });

      const { suggestQuestions } = await import("./analyze");
      const questions = await suggestQuestions({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
        count: 3,
      });

      expect(questions).toHaveLength(3);
      expect(questions[0]?.category).toBe("trend");
      expect(questions[0]?.question).toContain("trend");
    });

    it("limits results to requested count", async () => {
      const { generateObject } = await import("ai");
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: {
          questions: [
            { question: "Q1", category: "trend" },
            { question: "Q2", category: "comparison" },
            { question: "Q3", category: "anomaly" },
            { question: "Q4", category: "insight" },
            { question: "Q5", category: "correlation" },
          ],
        },
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        warnings: undefined,
        request: {} as never,
        response: {} as never,
        logprobs: undefined,
        toJsonResponse: (() => new Response()) as never,
        providerMetadata: undefined,
      });

      const { suggestQuestions } = await import("./analyze");
      const questions = await suggestQuestions({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
        count: 2,
      });

      expect(questions).toHaveLength(2);
    });
  });

  describe("analyzeData", () => {
    it("runs summary, anomalies, and charts in parallel", async () => {
      const { generateObject } = await import("ai");
      const mockedGenerate = vi.mocked(generateObject);
      const callsBefore = mockedGenerate.mock.calls.length;

      // Three calls: summarizeData, detectAnomalies, suggestCharts
      mockedGenerate
        .mockResolvedValueOnce({
          object: { summary: "Test", keyInsights: ["A"], dataQuality: "OK" },
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          warnings: undefined,
          request: {} as never,
          response: {} as never,
          logprobs: undefined,
          toJsonResponse: (() => new Response()) as never,
          providerMetadata: undefined,
        })
        .mockResolvedValueOnce({
          object: { anomalies: [] },
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          warnings: undefined,
          request: {} as never,
          response: {} as never,
          logprobs: undefined,
          toJsonResponse: (() => new Response()) as never,
          providerMetadata: undefined,
        })
        .mockResolvedValueOnce({
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

      const { analyzeData } = await import("./analyze");
      const result = await analyzeData({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
      });

      expect(result.summary.summary).toBe("Test");
      expect(result.anomalies).toEqual([]);
      expect(result.charts).toEqual([]);
      // 3 new calls: summary + anomalies + charts
      expect(mockedGenerate.mock.calls.length - callsBefore).toBe(3);
    });

    it("skips anomalies when detectAnomalies is false", async () => {
      const { generateObject } = await import("ai");
      const mockedGenerate = vi.mocked(generateObject);
      const callsBefore = mockedGenerate.mock.calls.length;

      mockedGenerate
        .mockResolvedValueOnce({
          object: { summary: "Test", keyInsights: [], dataQuality: "OK" },
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          warnings: undefined,
          request: {} as never,
          response: {} as never,
          logprobs: undefined,
          toJsonResponse: (() => new Response()) as never,
          providerMetadata: undefined,
        })
        .mockResolvedValueOnce({
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

      const { analyzeData } = await import("./analyze");
      const result = await analyzeData({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
        detectAnomalies: false,
      });

      expect(result.anomalies).toEqual([]);
      // Only 2 new calls (summary + charts), not 3
      expect(mockedGenerate.mock.calls.length - callsBefore).toBe(2);
    });

    it("skips charts when suggestCharts is false", async () => {
      const { generateObject } = await import("ai");
      const mockedGenerate = vi.mocked(generateObject);
      const callsBefore = mockedGenerate.mock.calls.length;

      mockedGenerate
        .mockResolvedValueOnce({
          object: { summary: "Test", keyInsights: [], dataQuality: "OK" },
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          warnings: undefined,
          request: {} as never,
          response: {} as never,
          logprobs: undefined,
          toJsonResponse: (() => new Response()) as never,
          providerMetadata: undefined,
        })
        .mockResolvedValueOnce({
          object: { anomalies: [] },
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          warnings: undefined,
          request: {} as never,
          response: {} as never,
          logprobs: undefined,
          toJsonResponse: (() => new Response()) as never,
          providerMetadata: undefined,
        });

      const { analyzeData } = await import("./analyze");
      const result = await analyzeData({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: sampleData,
        suggestCharts: false,
      });

      expect(result.charts).toEqual([]);
      expect(mockedGenerate.mock.calls.length - callsBefore).toBe(2);
    });
  });

  describe("cancellation and history", () => {
    it("cancels sibling requests when one fails", async () => {
      const { generateObject } = await import("ai");
      const signals: AbortSignal[] = [];
      vi.mocked(generateObject).mockImplementation(((options: {
        abortSignal: AbortSignal;
        schema: unknown;
      }) => {
        signals.push(options.abortSignal);
        if (signals.length === 1)
          return Promise.reject(
            Object.assign(new Error("Server error"), { statusCode: 500 }),
          );
        return new Promise((_, reject) =>
          options.abortSignal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        );
      }) as never);

      const { analyzeData } = await import("./analyze");
      await expect(
        analyzeData({
          model: { apiKey: "sk-test", model: "gpt-4o" },
          data: sampleData,
        }),
      ).rejects.toMatchObject({ statusCode: 500 });
      expect(signals).toHaveLength(3);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
    });

    it("rethrows an abort as is", async () => {
      const { generateObject } = await import("ai");
      const abort = new DOMException("aborted", "AbortError");
      vi.mocked(generateObject).mockRejectedValueOnce(abort);
      const { summarizeData } = await import("./analyze");
      await expect(
        summarizeData({
          model: { apiKey: "sk-test", model: "gpt-4o" },
          data: sampleData,
        }),
      ).rejects.toBe(abort);
    });

    it("bounds the history and leaves out failed answers", async () => {
      const { buildHistoryContext } = await import("./analyze");
      const history = Array.from({ length: 30 }, (_, i) => ({
        prompt: `q${i}`,
        response: `a${i}`,
        error: i === 29,
      }));
      const context = buildHistoryContext(history, 3);
      expect(context).not.toContain("q29");
      expect(context).toContain("q28");
      expect(context).toContain("q26");
      expect(context).not.toContain("q25");
      expect(context.indexOf("q26")).toBeLessThan(context.indexOf("q28"));

      const long = [
        { prompt: "old", response: "x".repeat(50) },
        { prompt: "new", response: "y".repeat(50) },
      ];
      const budgeted = buildHistoryContext(long, 10, 80);
      expect(budgeted).toContain("new");
      expect(budgeted).not.toContain("old");
    });

    it("clips long cells in the anomaly sample", async () => {
      const { generateObject } = await import("ai");
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: { anomalies: [] },
      } as never);
      const { detectAnomalies } = await import("./analyze");
      await detectAnomalies({
        model: { apiKey: "sk-test", model: "gpt-4o" },
        data: { ...sampleData, rows: [["A", "1", "z".repeat(10_000)]] },
        dataSummary: "summary",
      });
      const prompt = vi.mocked(generateObject).mock.calls[0]![0]
        .prompt as string;
      expect(prompt.length).toBeLessThan(1000);
    });
  });
});
