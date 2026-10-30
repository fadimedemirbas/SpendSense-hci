import { expect, test } from "@playwright/test";
import {
  PROFILE,
  fitsAndIsAccessible,
  go,
  legacyWorkspace,
  login,
  mixedWorkspace,
  mockRates,
  seed,
  watch,
} from "./currency-helpers";

// The display currency (Settings and Onboarding): TRY / USD / EUR, saved through
// protocol 3 and separate from the symbol/code amount format.

test("Settings saves USD as the display currency and Home switches to dollars", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  const { saves } = watch(page);
  await login(page);
  await go(page, "Settings");
  const group = page.getByRole("radiogroup", { name: "Display currency" });
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeChecked();
  for (const name of ["₺ TRY", "$ USD", "€ EUR"])
    await expect(group.getByRole("radio", { name })).not.toHaveAttribute("aria-disabled");
  await expect(
    page.getByText("Totals are shown in this currency. Your records keep their original amounts."),
  ).toBeVisible();
  await group.getByRole("radio", { name: "$ USD" }).click();
  await expect(group.getByRole("radio", { name: "$ USD" })).toBeChecked();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].schemaVersion).toBe(3);
  expect(saves[0].profile).toMatchObject({ displayCurrency: "USD", currency: "symbol" });
  // Records keep their own currency; nothing was converted in storage.
  expect(saves[0].entries.map((e) => [e.id, e.amount, e.currency])).toEqual([
    ["pay", 30000, "TRY"],
    ["gig", 500, "USD"],
    ["food", 1250, "TRY"],
    ["trip", 100, "EUR"],
    ["app", 10, "USD"],
  ]);

  // The amount format is a separate preference.
  const format = page.getByRole("radiogroup", { name: "Amount format" });
  await format.getByRole("radio", { name: "1.000 TRY" }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].profile).toMatchObject({ displayCurrency: "USD", currency: "code" });
  await format.getByRole("radio", { name: "₺ 1.000" }).click();
  await expect.poll(() => saves.length).toBe(3);

  // Home now totals the month in dollars: (50.000 − 6.150) / 40 = 1.096,25.
  await go(page, "Home");
  await expect(page.getByText("≈ $1.096", { exact: true })).toBeVisible();
  await expect(page.getByText("≈ $1.250", { exact: true })).toBeVisible();
  await page.reload();
  await go(page, "Settings");
  await expect(
    page
      .getByRole("radiogroup", { name: "Display currency" })
      .getByRole("radio", { name: "$ USD" }),
  ).toBeChecked();
});

test("Settings selectors are translated, accessible and fit 320px", async ({ page, request }) => {
  await seed(request, legacyWorkspace());
  await page.setViewportSize({ width: 320, height: 640 });
  await login(page);
  await go(page, "Settings");
  await fitsAndIsAccessible(page);
  await page.getByRole("radio", { name: "Türkçe", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "Görüntüleme para birimi" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Tutar biçimi" })).toBeVisible();
  await expect(
    page.getByText(
      "Toplamlar bu para biriminde gösterilir. Kayıtların orijinal tutarlarını korur.",
    ),
  ).toBeVisible();
  await fitsAndIsAccessible(page);
});

test("onboarding saves the chosen currency and keeps lira income ranges", async ({
  page,
  request,
}) => {
  await seed(request, {
    ...legacyWorkspace(),
    profile: { ...PROFILE, onboarded: false, habits: [] },
    entries: [],
    goals: [],
  });
  await page.setViewportSize({ width: 320, height: 640 });
  const { saves } = watch(page);
  await login(page, "en", false);
  await expect(page.getByText("Step 1 of 7")).toBeVisible();
  const group = page.getByRole("radiogroup", { name: "Which currency do you use?" });
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeChecked();
  await group.getByRole("radio", { name: "€ EUR" }).click();
  await expect(group.getByRole("radio", { name: "€ EUR" })).toBeChecked();
  await expect(page.getByText("Income ranges are in Turkish lira.")).toBeVisible();
  await expect(page.getByRole("button", { name: "₺15–30k" })).toBeVisible();
  await fitsAndIsAccessible(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  for (let question = 0; question < 4; question++) {
    await page.locator("section button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let's go", exact: true }).click();
  await expect(page.locator("main")).toBeVisible();
  await expect.poll(() => saves.length).toBeGreaterThan(0);
  expect(saves.at(-1)).toMatchObject({
    schemaVersion: 3,
    profile: { onboarded: true, displayCurrency: "EUR", currency: "symbol" },
  });
});
