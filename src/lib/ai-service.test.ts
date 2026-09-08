import { afterEach, expect, it, vi } from "vitest";
import { generateDataSummary, getModel } from "./ai-service";

afterEach(() => vi.unstubAllGlobals());

it("resolves a GLM model selected from the OpenAI-compatible catalog", () => {
  const model = getModel({
    apiKey: "test-placeholder",
    providerId: "zai",
    providerNpm: "@ai-sdk/openai-compatible",
    providerApi: "https://api.z.ai/api/paas/v4",
    model: "glm-4.7",
  });
  expect(model).toHaveProperty("modelId", "glm-4.7");
});

it("requires the compatible provider URL rather than sending its key elsewhere", () => {
  expect(() =>
    getModel({
      apiKey: "test-placeholder",
      providerNpm: "@ai-sdk/openai-compatible",
      model: "glm-4.7",
    }),
  ).toThrow("This provider has no API URL");
});

it.each([
  "https://api.z.ai/api/paas/v4",
  "https://open.bigmodel.cn/api/paas/v4",
])(
  "generates a summary through compatible chat completions at %s",
  async (baseURL) => {
    const summary = {
      summary: "Two sales rows",
      keyInsights: ["Both amounts are positive"],
      dataQuality: "Complete",
    };
    const fetch = vi.fn(async () =>
      Response.json({
        id: "test",
        created: 1,
        model: "glm-4.7",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(summary) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      generateDataSummary(
        {
          apiKey: "test-placeholder",
          providerNpm: "@ai-sdk/openai-compatible",
          providerApi: baseURL,
          model: "glm-4.7",
        },
        "amount\n1\n2",
      ),
    ).resolves.toEqual(summary);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${baseURL}/chat/completions`);
    expect(new Headers(options.headers).get("authorization")).toBe(
      "Bearer test-placeholder",
    );
    expect(JSON.parse(options.body as string)).toMatchObject({
      model: "glm-4.7",
      response_format: { type: "json_object" },
    });
    // JSON-object APIs still need the schema in the prompt to know the required keys.
    expect(JSON.parse(options.body as string).messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining(
            '"required":["summary","keyInsights","dataQuality"]',
          ),
        }),
      ]),
    );
  },
);
