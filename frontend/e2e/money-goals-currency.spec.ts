import { expect, test, type Page } from "@playwright/test";
import {
  FRESH_DATE,
  bulletinText,
  fitsAndIsAccessible,
  go,
  legacyWorkspace,
  login,
  mixedWorkspace,
  mockRates,
  seed,
  watch,
} from "./currency-helpers";

// Money and Goals: every record keeps its own amount and currency; totals are in
// the display currency, converted only with validated rates.

const summary = (page: Page) => page.locator("dl").filter({ hasText: "Income" }).first();

test("Money: mixed month is converted with fresh rates and dated", async ({ page, request }) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await go(page, "Money");
  await expect(page.getByText("Totals in Turkish lira")).toBeVisible();
  await expect(summary(page)).toContainText("Income≈ ₺50.000");
  await expect(summary(page)).toContainText("Spent≈ ₺6.150");
  await expect(summary(page)).toContainText("Left≈ ₺43.850");
  await expect(
    page.getByText(`Approximate. Converted with TCMB rates from ${bulletinText(FRESH_DATE)}.`),
  ).toBeVisible();
  await expect(page.getByText("These rates may be out of date.")).toHaveCount(0);
  // Each entry is listed in its original currency.
  await expect(page.getByText("+$500", { exact: true })).toBeVisible();
  await expect(page.getByText("−€100", { exact: true })).toBeVisible();
  await expect(page.getByText("−₺1.250", { exact: true })).toBeVisible();
});

test("Money: stale rates are used but flagged as possibly out of date", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "stale");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await go(page, "Money");
  await expect(summary(page)).toContainText("Left≈ ₺43.850");
  await expect(page.getByText("These rates may be out of date.")).toBeVisible();
});

test("Money: without rates different currencies are never added", async ({ page, request }) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "missing");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await go(page, "Money");
  await expect(summary(page)).toContainText("Income₺30.000 + $500");
  await expect(summary(page)).toContainText("Spent₺1.250 + $10 + €100");
  await expect(page.getByText("By currency")).toBeVisible();
  await expect(
    page.getByText(
      "Exchange rates are unavailable right now, so amounts in different currencies are not added together.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/≈/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("Money: a USD expense is saved in dollars and keeps its currency when edited", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  const { saves } = watch(page);
  await login(page);
  await go(page, "Money");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Quick add" });
  const currency = sheet.getByRole("radiogroup", { name: "Currency" });
  await expect(currency.getByRole("radio", { name: "₺ TRY" })).toBeChecked(); // display currency
  await currency.getByRole("radio", { name: "$ USD" }).click();
  await expect(sheet.getByLabel("Amount ($)", { exact: true })).toBeVisible();
  for (const key of ["2", "5", ".", "5"])
    await sheet.getByRole("button", { name: key, exact: true }).click();
  await sheet.getByRole("button", { name: "Food", exact: true }).click();
  await sheet.getByLabel("Note (optional)").fill("Lunch");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].schemaVersion).toBe(3);
  expect(saves[0].entries[0]).toMatchObject({ name: "Lunch", amount: 25.5, currency: "USD" });
  // 6.150 + 25,50 × 40 = 7.170
  await expect(summary(page)).toContainText("Spent≈ ₺7.170");
  await expect(page.getByText("−$26", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit Lunch", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit entry" });
  const locked = edit.getByRole("radiogroup", { name: "Currency" });
  await expect(locked.getByRole("radio", { name: "$ USD" })).toBeChecked();
  for (const name of ["₺ TRY", "€ EUR"]) {
    await expect(locked.getByRole("radio", { name })).toHaveAttribute("aria-disabled", "true");
    await locked.getByRole("radio", { name }).click({ force: true });
  }
  await expect(locked.getByRole("radio", { name: "$ USD" })).toBeChecked();
  await expect(edit.getByText("A saved entry keeps its original currency.")).toBeVisible();
  await edit.getByRole("button", { name: "Delete last digit" }).click();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].entries.find((e) => e.name === "Lunch")).toMatchObject({
    amount: 25,
    currency: "USD",
  });
  await page.reload();
  await go(page, "Money");
  await expect(page.getByText("−$25", { exact: true })).toBeVisible();
});

test("Goals: a EUR goal shows its progress in euros and a lira equivalent", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  const { saves } = watch(page);
  await login(page);
  await go(page, "Goals");
  await expect(page.getByRole("img", { name: "Rome 25%" })).toBeVisible();
  await expect(page.getByText("€500 / €2.000")).toBeVisible();
  await expect(
    page.getByText("About ₺22.500 of ₺90.000 in Turkish lira.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("₺2.500 / ₺10.000")).toBeVisible(); // TRY goal: no equivalent

  // New goal in dollars.
  await page.getByRole("button", { name: "Add goal", exact: true }).click();
  await page.getByLabel("Goal name").fill("Laptop");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Goal currency" })
    .getByRole("radio", { name: "$ USD" })
    .click();
  await expect(page.getByLabel("Target ($)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "$1.000", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Saved ($)", { exact: true }).fill("250");
  await expect(page.getByRole("img", { name: "Laptop 25%" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].schemaVersion).toBe(3);
  expect(saves[0].goals[0]).toMatchObject({ target: 1000, saved: 250, currency: "USD" });
  await expect(page.getByText("$250 / $1.000")).toBeVisible();

  // Editing keeps the euro target unconverted.
  await page.getByRole("button", { name: "Edit Rome", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Target (€)", { exact: true })).toHaveValue("2000");
  const locked = page.getByRole("radiogroup", { name: "Goal currency" });
  await expect(locked.getByRole("radio", { name: "€ EUR" })).toBeChecked();
  await expect(locked.getByRole("radio", { name: "₺ TRY" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByText("A goal keeps the currency it was created in.")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).last().click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  // Adding money stays in euros.
  await page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Rome", exact: true }) })
    .getByRole("button", { name: "Add money", exact: true })
    .last()
    .click();
  await page.getByRole("dialog").getByLabel("Amount (€)", { exact: true }).fill("500");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("img", { name: "Rome 50%" })).toBeVisible();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].goals.find((g) => g.id === "rome")).toMatchObject({
    target: 2000,
    saved: 1000,
    currency: "EUR",
  });
});

test("Goals without rates show the goal in its own currency only", async ({ page, request }) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "missing");
  await login(page);
  await go(page, "Goals");
  await expect(page.getByText("€500 / €2.000")).toBeVisible();
  await expect(page.getByRole("img", { name: "Rome 25%" })).toBeVisible(); // no rate needed
  await expect(
    page.getByText("Exchange rates are unavailable, so this goal is shown in euro only."),
  ).toBeVisible();
});

test("legacy TRY data loads as lira and never requests exchange rates", async ({
  page,
  request,
}) => {
  await seed(request, legacyWorkspace());
  const { rateRequests } = watch(page);
  await login(page);
  await go(page, "Money");
  await expect(summary(page)).toContainText("Left₺28.350");
  await expect(page.getByText(/≈|Approximate/)).toHaveCount(0);
  await go(page, "Goals");
  await expect(page.getByText("₺2.500 / ₺10.000")).toBeVisible();
  expect(rateRequests).toEqual([]);
});

test("Money and Goals currency controls are translated, accessible and fit 320px", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 320, height: 640 });
  await login(page, "tr");
  await go(page, "Para");
  await expect(page.getByRole("heading", { name: "Bu ay" })).toBeVisible();
  await expect(page.getByText("Türk lirası cinsinden toplamlar")).toBeVisible();
  await expect(
    page.getByText(/Yaklaşık değer\. .* tarihli TCMB kurlarıyla çevrildi\./),
  ).toBeVisible();
  await fitsAndIsAccessible(page);
  await page.getByRole("button", { name: "Gider ekle", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("radiogroup", { name: "Para birimi" }),
  ).toBeVisible();
  await fitsAndIsAccessible(page);
  await page.keyboard.press("Escape");
  await go(page, "Hedefler");
  await expect(
    page.getByText("Türk lirası cinsinden yaklaşık ₺90.000 içinden ₺22.500."),
  ).toBeVisible();
  await fitsAndIsAccessible(page);
});
