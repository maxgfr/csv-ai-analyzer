import { test, expect, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
async function configure(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "API settings", exact: true }).click();
  await page.getByText("Use Custom Endpoint", { exact: true }).click();
  await page
    .getByLabel("API Base URL")
    .fill("http://127.0.0.1:3100/mock-ai/v1");
  await page.getByLabel("Model Name", { exact: true }).fill("test-model");
  await page
    .getByRole("button", { name: "Save Configuration", exact: true })
    .click();
  await page.getByLabel("Choose CSV or Excel file").setInputFiles({
    name: "ai.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,amount\nAlice,20\nBob,2"),
  });
  await page.getByRole("button", { name: "Import data", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run Complete Analysis" }),
  ).toBeEnabled();
}
async function objectResponse(route: Route, value: unknown) {
  await route.fulfill({
    json: {
      id: "mock",
      object: "chat.completion",
      created: 1,
      model: "test-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(value) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  });
}

test("GLM catalog selection generates a summary through the compatible provider", async ({
  page,
}) => {
  const catalog = JSON.parse(readFileSync("public/models.json", "utf8"));
  const zai = catalog.zai;
  await page.route("**/models.json", (route) =>
    route.fulfill({
      json: {
        zai: { ...zai, models: { "glm-4.7": zai.models["glm-4.7"] } },
      },
    }),
  );
  let requests = 0;
  await page.route(`${zai.api}/**`, async (route) => {
    requests++;
    expect(route.request().url()).toBe(`${zai.api}/chat/completions`);
    expect(route.request().headers().authorization).toBe(
      "Bearer test-placeholder",
    );
    expect(route.request().postDataJSON()).toMatchObject({
      model: "glm-4.7",
      response_format: { type: "json_object" },
    });
    await objectResponse(route, {
      summary: "GLM summary verified",
      keyInsights: ["Two rows"],
      dataQuality: "Complete",
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "API settings", exact: true }).click();
  await page.getByLabel("Provider", { exact: true }).selectOption("zai");
  await page
    .getByLabel("Provider API Key", { exact: true })
    .fill("test-placeholder");
  await page.getByRole("button", { name: /GLM-4\.7/ }).click();
  await page
    .getByRole("button", { name: "Save Configuration", exact: true })
    .click();
  await page.getByLabel("Choose CSV or Excel file").setInputFiles({
    name: "glm.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,amount\nA,1\nB,2"),
  });
  await page.getByRole("button", { name: "Import data", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate Summary", exact: true })
    .click();
  await expect(
    page.getByText("GLM summary verified", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
});
test("custom endpoint uses chat completions, handles partial failure and retries summary", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/mock-ai/v1/**", async (route) => {
    expect(route.request().url()).toContain("/chat/completions");
    const body = route.request().postDataJSON();
    const schema = JSON.stringify(body.response_format);
    if (schema.includes("keyInsights")) {
      if (fail)
        await route.fulfill({
          status: 401,
          json: {
            error: {
              message: "Test authentication failure",
              type: "authentication_error",
            },
          },
        });
      else
        await objectResponse(route, {
          summary: "Verified summary",
          keyInsights: ["One insight"],
          dataQuality: "Two complete rows",
        });
    } else if (schema.includes("anomalies"))
      await objectResponse(route, { anomalies: [] });
    else await objectResponse(route, { charts: [] });
  });
  await configure(page);
  await page.getByRole("button", { name: "Run Complete Analysis" }).click();
  await expect(
    page.getByText("Error generating summary", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run Complete Analysis" }),
  ).toBeEnabled();
  fail = false;
  await page
    .getByRole("button", { name: "Generate Summary", exact: true })
    .click();
  await expect(
    page.getByText("Verified summary", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Error generating summary", { exact: true }),
  ).toHaveCount(0);
});
test("cancel and reimport reject late analysis results", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("**/mock-ai/v1/**", async (route) => {
    started = true;
    await pending;
    await objectResponse(route, {
      summary: "STALE RESULT",
      keyInsights: [],
      dataQuality: "Old data",
    }).catch(() => {});
  });
  await configure(page);
  await page
    .getByRole("button", { name: "Generate Summary", exact: true })
    .click();
  await expect.poll(() => started).toBe(true);
  await page
    .getByRole("button", { name: "Stop analysis", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reimport with different settings" })
    .click();
  await page.getByRole("button", { name: "Import data", exact: true }).click();
  release();
  await expect(
    page.getByRole("button", { name: "Generate Summary", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("STALE RESULT", { exact: true })).toHaveCount(0);
});
test("streamed chat completes and is cleared on data change", async ({
  page,
}) => {
  await page.route("**/mock-ai/v1/**", async (route) => {
    const body = route.request().postDataJSON();
    if (!body.stream) {
      await objectResponse(route, { questions: [] });
      return;
    }
    const chunks = [
      { role: "assistant", content: "Hello " },
      { content: "from the dataset." },
    ].map((delta) => ({
      id: "chat",
      object: "chat.completion.chunk",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, delta, finish_reason: null }],
    }));
    const done = {
      id: "chat",
      object: "chat.completion.chunk",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    };
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        [...chunks, done]
          .map((chunk) => "data: " + JSON.stringify(chunk) + "\n\n")
          .join("") + "data: [DONE]\n\n",
    });
  });
  await configure(page);
  await page.getByRole("button", { name: "Custom Query", exact: true }).click();
  await page
    .getByPlaceholder("Ask a question about your data...")
    .fill("Describe these rows");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(
    page.getByText("Hello from the dataset.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reimport with different settings" })
    .click();
  await page.getByRole("button", { name: "Import data", exact: true }).click();
  await expect(
    page.getByText("Hello from the dataset.", { exact: true }),
  ).toHaveCount(0);
});

test("anomalies remain readable in light and dark themes", async ({
  page,
}, testInfo) => {
  await page.route("**/mock-ai/v1/**", async (route) =>
    objectResponse(route, {
      anomalies: [
        {
          row: 1,
          column: "PageViews",
          value: "1016",
          severity: "medium",
          issue:
            "Valeur basse à vérifier dans le contexte du jeu de données. Comparez cette observation avec les autres périodes avant de la modifier.",
        },
        {
          row: 2,
          column: "BounceRate",
          value: "35.3",
          severity: "low",
          issue:
            "Cette valeur est inférieure à la moyenne. Une variation habituelle peut expliquer cet écart.",
        },
        {
          row: 2,
          column: "VeryLongColumnNameWithoutSpacesToCheckSmallScreenWrapping",
          value: "MissingValueWithALongUnbrokenIdentifierToCheckWrapping",
          severity: "high",
          issue:
            "Vérifiez la valeur source et le format de cette colonne avant de poursuivre l’analyse.",
        },
      ],
    }),
  );
  await configure(page);
  await page.getByRole("button", { name: "Anomalies", exact: true }).click();
  await page
    .getByRole("button", { name: "Detect Anomalies", exact: true })
    .click();
  const list = page.getByRole("list", { name: "Detected anomalies" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  for (const theme of ["Light", "Dark"]) {
    await page
      .getByRole("button", { name: `Switch to ${theme} theme` })
      .click();
    const contrasts = await list.evaluate((element) => {
      const luminance = (color: string) => {
        const rgb = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
      };
      return Array.from(
        element.querySelectorAll(".anomaly-card, .anomaly-severity"),
      ).map((card) => {
        const style = getComputedStyle(card);
        const a = luminance(style.color),
          b = luminance(style.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    });
    expect(contrasts).toHaveLength(6);
    for (const contrast of contrasts)
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(
      await list.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await list.screenshot({
      path: testInfo.outputPath(`anomalies-${theme.toLowerCase()}.png`),
    });
  }
});
