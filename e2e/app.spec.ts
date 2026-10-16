import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { storageDump, useStaticCatalog } from "./storage-dump";
// The catalog comes from public/models.json unless a test serves models.dev
test.beforeEach(({ page }) => useStaticCatalog(page));
const csv = "name,amount,group\nAlice,20,A\nBob,2,B\nAlice,20,A\nEmpty,,B";
async function importCSV(page: Page, content = csv) {
  await page.goto("/");
  await page.getByLabel("Choose CSV or Excel file").setInputFiles({
    name: "data.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(content),
  });
  await expect(
    page.getByRole("heading", { name: "Import preview — data.csv" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import data", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Data Preview", exact: true }),
  ).toBeVisible();
}
test("import, quality, search, transforms, reimport and fullscreen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await importCSV(page);
  await expect(
    page.getByText("4 rows · 1 repeated rows beyond the first occurrence"),
  ).toBeVisible();
  await page.getByLabel("Search visible columns").fill("bob");
  const preview = page
    .getByRole("table")
    .filter({ has: page.getByRole("button", { name: /name string/ }) });
  await expect(preview.getByText("Bob", { exact: true })).toBeVisible();
  await expect(preview.getByText("Alice", { exact: true })).toHaveCount(0);
  await page.getByLabel("Search visible columns").fill("");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByPlaceholder("Value...").fill("Bob");
  await expect(
    page.getByText("1 rows · 0 repeated rows beyond the first occurrence"),
  ).toBeVisible();
  await expect(preview.getByText("Alice", { exact: true })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("transformed-data.csv");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page
    .getByRole("button", { name: "Reimport with different settings" })
    .click();
  await expect(
    page.getByRole("button", { name: "Import data", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Import data", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Data Preview", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("large-file worker completes and finds the last row", async ({ page }) => {
  await importCSV(
    page,
    "name,amount\n" +
      Array.from({ length: 100000 }, (_, i) => `item-${i},${i}`).join("\n"),
  );
  await page.getByLabel("Search visible columns").fill("item-99999");
  await expect(
    page.getByRole("cell", { name: "item-99999", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("1-1 of 1", { exact: true })).toBeVisible();
});
test("Excel sheet selection and Latin-1 decoding", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("Choose CSV or Excel file")
    .setInputFiles("e2e/fixtures/sheets.xlsx");
  await page.getByLabel("Excel sheet").selectOption("Second");
  await expect(
    page.getByRole("cell", { name: "second sheet value" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import data", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "second sheet value" }),
  ).toBeVisible();
  await page.goto("/");
  await page.getByLabel("Choose CSV or Excel file").setInputFiles({
    name: "latin.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name\ncafé", "latin1"),
  });
  await page.getByLabel("Import encoding").selectOption("Windows-1252");
  await expect(page.getByRole("cell", { name: "café" })).toBeVisible();
});
test("manual charts, chart exports, PDF, theme and keyboard fullscreen", async ({
  page,
}, testInfo) => {
  await importCSV(page);
  await page.getByRole("button", { name: "Manual column selection" }).click();
  await page.getByLabel("Chart Title *", { exact: true }).fill("Rows by name");
  await page.getByLabel("Aggregation", { exact: true }).selectOption("count");
  await page
    .getByLabel("X Axis (Categories) *", { exact: true })
    .selectOption("name");
  await page.getByRole("button", { name: "Create Chart", exact: true }).click();
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  for (const [title, extension] of [
    ["Export chart data as CSV", ".csv"],
    ["Export chart as PNG image", ".png"],
  ]) {
    const download = page.waitForEvent("download");
    await page.getByTitle(title!).click();
    expect((await download).suggestedFilename()).toContain(extension!);
  }
  const fullscreen = page
    .getByRole("button", { name: "Enter Fullscreen" })
    .first();
  await fullscreen.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Fullscreen view" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Fullscreen view" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to Light theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("light.png"),
    fullPage: testInfo.project.name !== "mobile",
  });
  await page.getByRole("button", { name: "Switch to Dark theme" }).click();
  await page.screenshot({
    path: testInfo.outputPath("dark.png"),
    fullPage: testInfo.project.name !== "mobile",
  });
  await page
    .getByRole("heading", { name: "Charts", exact: true })
    .scrollIntoViewIfNeeded();
  if (testInfo.project.name === "mobile")
    await page.screenshot({ path: testInfo.outputPath("charts-mobile.png") });
  const pdf = page.waitForEvent("download");
  await page.getByTitle("Export full report as PDF").click();
  const file = await pdf;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).subarray(0, 4).toString()).toBe("%PDF");
});
test("comparison preserves duplicate keys and extra occurrences", async ({
  page,
}, testInfo) => {
  await importCSV(page, "id,value\nx,1\nx,2\nx,3");
  const input = page.getByLabel("Choose CSV or Excel file");
  await page
    .getByText("Choose a file", { exact: true })
    .scrollIntoViewIfNeeded();
  await input.focus();
  await expect(input).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("compare-upload.png") });
  const chooser = page.waitForEvent("filechooser");
  await input.press("Enter");
  await (
    await chooser
  ).setFiles({
    name: "compare.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,value\nx,1\nx,4"),
  });
  await page.getByRole("button", { name: "Import data", exact: true }).click();
  await page.getByRole("button", { name: "Key column", exact: true }).click();
  await expect(page.getByText(/Repeated keys: 2 in A, 1 in B/)).toBeVisible();
});

test("sample data works and settings persist across reloads", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load Sample Data" }).click();
  await page
    .getByRole("button", { name: "📊 Sales Data", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Data Preview", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to Light theme" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("Escape closes the parser and API settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Parser settings" }).click();
  await expect(
    page.getByRole("dialog", { name: "Parser Settings" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Parser Settings" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "API settings", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "API Configuration" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "API Configuration" }),
  ).toHaveCount(0);
});

test("the model list loads only in the settings and can be retried", async ({
  page,
}) => {
  let catalogRequests = 0;
  let fail = true;
  await page.route("**/models.json", async (route) => {
    catalogRequests++;
    if (fail) await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(catalogRequests).toBe(0);

  await page.getByRole("button", { name: "API settings", exact: true }).click();
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  // A failure must not loop
  await page.waitForTimeout(500);
  expect(catalogRequests).toBe(1);

  fail = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(
    page.getByLabel("Provider", { exact: true }).locator("option", {
      hasText: "Anthropic",
    }),
  ).toHaveCount(1);
});

test("changing provider saves a model of that provider", async ({ page }) => {
  const catalog = JSON.parse(
    readFileSync("public/models.json", "utf8"),
  ) as Record<string, { models: Record<string, unknown> }>;
  await page.goto("/");
  await page.getByRole("button", { name: "API settings", exact: true }).click();
  await page.getByLabel("Provider", { exact: true }).selectOption("openai");
  await page.getByLabel("Provider", { exact: true }).selectOption("anthropic");
  await page.getByLabel("Provider API Key", { exact: true }).fill("sk-test");
  await page
    .getByRole("button", { name: "Save Configuration", exact: true })
    .click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("csv-ai-settings") ?? "{}"),
  );
  expect(saved.providerId).toBe("anthropic");
  expect(Object.keys(catalog.anthropic!.models)).toContain(saved.model);
});

test("an API key is never stored in clear text, and forgotten in a new tab unless remembered", async ({
  page,
  context,
}) => {
  const openSettings = (tab: Page) =>
    tab.getByRole("button", { name: "API settings", exact: true }).click();
  const keyField = (tab: Page) =>
    tab.getByLabel("Provider API Key", { exact: true });
  const saveKey = async (remember: boolean) => {
    await openSettings(page);
    await keyField(page).fill("sk-tab-secret");
    const box = page.getByLabel("Remember on this device");
    if (remember) await box.check();
    else await box.uncheck();
    await page
      .getByRole("button", { name: /GPT|gpt/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Save Configuration", exact: true })
      .click();
  };
  /** The key the settings show in a fresh tab, once decrypted. */
  const keyInNewTab = async () => {
    const tab = await context.newPage();
    await useStaticCatalog(tab);
    await tab.goto("/");
    await expect(
      tab.getByRole("button", { name: "API settings", exact: true }),
    ).toBeVisible();
    await tab.waitForLoadState("networkidle");
    await openSettings(tab);
    const key = await keyField(tab).inputValue();
    await tab.close();
    return key;
  };
  await page.goto("/");
  await saveKey(false);
  expect(await storageDump(page, context)).not.toContain("sk-tab-secret");
  expect(await keyInNewTab()).toBe("");
  // Reloading the same tab keeps it
  await page.reload();
  await openSettings(page);
  await expect(keyField(page)).toHaveValue("sk-tab-secret");
  await page.keyboard.press("Escape");

  await saveKey(true);
  const dump = await storageDump(page, context);
  expect(dump).not.toContain("sk-tab-secret");
  expect(dump).toContain("CryptoKey extractable=false");
  expect(await keyInNewTab()).toBe("sk-tab-secret");
  expect(await context.cookies()).toEqual([]);

  // Clear forgets everything
  await openSettings(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("Settings cleared")).toBeVisible();
  expect(await keyInNewTab()).toBe("");
});

test("settings saved in cookies by older versions are migrated, encrypted", async ({
  page,
  context,
}) => {
  const url = "http://127.0.0.1:3100";
  await context.addCookies([
    { name: "csv-ai-api-key", value: "sk-legacy", url },
    { name: "csv-ai-provider", value: "anthropic", url },
    { name: "csv-ai-model", value: "claude-legacy", url },
    { name: "csv-ai-theme", value: "light", url },
  ]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("csv-ai-settings") ?? "{}"),
      ),
    )
    .toMatchObject({
      providerId: "anthropic",
      model: "claude-legacy",
      rememberKey: true,
    });
  await expect
    .poll(async () =>
      (await context.cookies()).filter((c) => c.name.startsWith("csv-ai")),
    )
    .toEqual([]);
  expect(await storageDump(page, context)).not.toContain("sk-legacy");
  await page.getByRole("button", { name: "API settings", exact: true }).click();
  await expect(
    page.getByLabel("Provider API Key", { exact: true }),
  ).toHaveValue("sk-legacy");
});

test("a key v1.16 kept in clear text is re-encrypted", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(
      "csv-ai-settings",
      JSON.stringify({
        model: "gpt-x",
        providerId: "openai",
        rememberKey: true,
      }),
    );
    localStorage.setItem("csv-ai-api-key", "sk-clear-text");
  });
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("csv-ai-api-key")))
    .toBeNull();
  expect(await storageDump(page, context)).not.toContain("sk-clear-text");
  await page.getByRole("button", { name: "API settings", exact: true }).click();
  await expect(
    page.getByLabel("Provider API Key", { exact: true }),
  ).toHaveValue("sk-clear-text");
});

const liveModel = (id: string, name: string) => ({
  id,
  name,
  attachment: false,
  reasoning: false,
  tool_call: true,
  open_weights: false,
  release_date: "2026-01-01",
  last_updated: "2026-01-01",
  modalities: { input: ["text"], output: ["text"] },
  limit: { context: 200000, output: 8192 },
});
const liveProvider = (
  id: string,
  name: string,
  npm: string,
  model: string,
) => ({
  id,
  name,
  npm,
  doc: "",
  env: [],
  models: { [model]: liveModel(model, `${name} Live`) },
});

test("the model catalog is built live from models.dev, with models.json as fallback", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/models.json", (route) => {
    requests.push("models.json");
    return route.continue();
  });
  await page.route("https://openrouter.ai/**", (route) =>
    route.fulfill({ status: 503, body: "down" }),
  );
  await page.route("https://models.dev/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      json: {
        openai: liveProvider("openai", "OpenAI", "@ai-sdk/openai", "gpt-live"),
        anthropic: liveProvider(
          "anthropic",
          "Anthropic",
          "@ai-sdk/anthropic",
          "claude-live",
        ),
        google: liveProvider(
          "google",
          "Google",
          "@ai-sdk/google",
          "gemini-live",
        ),
        mistral: liveProvider(
          "mistral",
          "Mistral",
          "@ai-sdk/mistral",
          "mistral-live",
        ),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "API settings", exact: true }).click();
  await page.getByLabel("Provider", { exact: true }).selectOption("anthropic");
  await expect(
    page.getByRole("button", { name: /Anthropic Live/ }).first(),
  ).toBeVisible();
  expect(requests).toEqual(["https://models.dev/api.json"]);
});

test("a remote plain-http endpoint is refused, a local one is saved", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "API settings", exact: true }).click();
  await page.getByText("Use Custom Endpoint", { exact: true }).click();
  await page.getByLabel("API Base URL").fill("http://192.168.1.10/v1");
  await page.getByLabel("Model Name", { exact: true }).fill("llama3.2");
  await page
    .getByRole("button", { name: "Save Configuration", exact: true })
    .click();
  await expect(
    page.getByText("Plain http is only allowed to this computer"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ollama", exact: true }).click();
  await page
    .getByRole("button", { name: "Save Configuration", exact: true })
    .click();
  await expect(page.getByText("Settings Saved")).toBeVisible();
});
