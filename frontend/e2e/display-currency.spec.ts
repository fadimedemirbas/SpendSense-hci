import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Phase 5A: the display-currency selector in Settings and Onboarding. This build is
// still TRY-only (client protocol 1), so USD/EUR are visible but not selectable and
// nothing but TRY can be sent to the database.

const SAVE = "/rest/v1/rpc/spendsense_save_workspace";
const profile = (onboarded = true) => ({
  email: "pwa-test@example.com",
  income: 1,
  savings: 1,
  habits: onboarded ? [0, 1, 2, 0] : [],
  onboarded,
  currency: "symbol",
});
const workspace = (onboarded = true) => ({
  profile: profile(onboarded),
  entries: [],
  goals: [],
  analyses: [],
  decisions: [],
  waiting: [],
});
async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("pwa-test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Log in", exact: true }).last().click();
}
async function openSettings(page: Page) {
  await expect(page.locator("main")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}
/** Collects the payloads of every workspace save the page sends. */
function recordSaves(page: Page) {
  const payloads: { schemaVersion: number; profile: Record<string, unknown> }[] = [];
  page.on("request", (request) => {
    if (request.url().includes(SAVE)) payloads.push(JSON.parse(request.postData() ?? "{}").payload);
  });
  return payloads;
}
async function noHorizontalScroll(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
}

test("Settings shows TRY as the saved display currency; USD/EUR cannot be chosen yet", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4180/__test/seed", { data: workspace() });
  await page.setViewportSize({ width: 390, height: 844 });
  const saves = recordSaves(page);
  await login(page);
  await openSettings(page);
  const group = page.getByRole("radiogroup", { name: "Display currency" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeChecked();
  for (const name of ["$ USD", "€ EUR"]) {
    const option = group.getByRole("radio", { name });
    await expect(option).toHaveAttribute("aria-disabled", "true");
    await option.click({ force: true });
    await expect(option).not.toBeChecked();
  }
  await expect(
    page.getByText("USD and EUR become available when multi-currency support is turned on."),
  ).toBeVisible();
  // Keyboard: arrows cannot move onto a disabled option.
  await group.getByRole("radio", { name: "₺ TRY" }).focus();
  for (const key of ["ArrowRight", "ArrowLeft", "End"]) await page.keyboard.press(key);
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeChecked();
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeFocused();
  expect(saves).toEqual([]); // nothing was sent, nothing claims to be saved
  // The symbol/code amount format is a separate preference and still saves.
  const format = page.getByRole("radiogroup", { name: "Amount format" });
  await format.getByRole("radio", { name: "1.000 TRY" }).click();
  await expect(format.getByRole("radio", { name: "1.000 TRY" })).toBeChecked();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].schemaVersion).toBe(1);
  expect(saves[0].profile).toMatchObject({ currency: "code", displayCurrency: "TRY" });
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeChecked();
  // The setting survives a reload unchanged.
  await page.reload();
  await openSettings(page);
  await expect(
    page
      .getByRole("radiogroup", { name: "Display currency" })
      .getByRole("radio", { name: "₺ TRY" }),
  ).toBeChecked();
});

test("Settings selectors are translated, accessible and fit 320px", async ({ page, request }) => {
  await request.post("http://127.0.0.1:4180/__test/seed", { data: workspace() });
  await page.setViewportSize({ width: 320, height: 640 });
  await login(page);
  await openSettings(page);
  await noHorizontalScroll(page);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole("radio", { name: "Türkçe", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "Görüntüleme para birimi" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Tutar biçimi" })).toBeVisible();
  await expect(page.getByText("USD ve EUR, çoklu para birimi desteği açıldığında")).toBeVisible();
  await noHorizontalScroll(page);
});

test("onboarding asks for the currency, keeps TRY income ranges and saves TRY", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4180/__test/seed", { data: workspace(false) });
  await page.setViewportSize({ width: 320, height: 640 });
  const saves = recordSaves(page);
  await login(page);
  await expect(page.getByText("Step 1 of 7")).toBeVisible();
  const group = page.getByRole("radiogroup", { name: "Which currency do you use?" });
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeChecked();
  await expect(group.getByRole("radio", { name: "$ USD" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await group.getByRole("radio", { name: "$ USD" }).click({ force: true });
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeChecked();
  await expect(page.getByText("Income ranges are in Turkish lira.")).toBeVisible();
  await expect(page.getByRole("button", { name: "₺15–30k" })).toBeVisible(); // ranges unchanged
  await noHorizontalScroll(page);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "Which currency do you use?" })).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  for (let question = 0; question < 4; question++) {
    await page.locator("section button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let's go", exact: true }).click();
  await expect(page.locator("main")).toBeVisible();
  await expect.poll(() => saves.length).toBeGreaterThan(0);
  expect(saves.at(-1)).toMatchObject({
    schemaVersion: 1,
    profile: { onboarded: true, displayCurrency: "TRY", currency: "symbol" },
  });
});
