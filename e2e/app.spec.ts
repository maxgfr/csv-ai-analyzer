import { test, expect, type Page } from "@playwright/test";
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
