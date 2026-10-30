import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Phase 5B: Money and Goals keep each record's own currency. This build is still
// TRY-only (client protocol 1): USD/EUR are visible but not selectable, nothing
// but TRY is sent, and a TRY-only workspace never asks for exchange rates.

const SAVE = "/rest/v1/rpc/spendsense_save_workspace";
const day = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
// Records saved before multi-currency support: no currency fields at all.
const legacyWorkspace = () => ({
  profile: {
    email: "pwa-test@example.com",
    income: 1,
    savings: 1,
    habits: [0, 1, 2, 0],
    onboarded: true,
    currency: "symbol",
  },
  entries: [
    { id: "pay", type: "income", amount: 30000, cat: "Salary", name: "Pay", date: day(0) },
    { id: "food", type: "expense", amount: 1250, cat: "Food", name: "Market", date: day(0) },
  ],
  goals: [{ id: "bike", name: "Bike", target: 10000, saved: 2500, status: "Active" }],
  analyses: [],
  decisions: [],
  waiting: [],
});
type Payload = {
  schemaVersion: number;
  entries: { id: string; amount: number; currency: string }[];
  goals: { id: string; target: number; saved: number; currency: string }[];
};
function watch(page: Page) {
  const saves: Payload[] = [];
  const rateRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(SAVE)) saves.push(JSON.parse(request.postData() ?? "{}").payload);
    if (request.url().includes("/api/rates")) rateRequests.push(request.url());
  });
  return { saves, rateRequests };
}
async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("pwa-test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Log in", exact: true }).last().click();
  await expect(page.locator("main")).toBeVisible();
}
const go = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).first().click();
async function expectOnlyTry(group: ReturnType<Page["getByRole"]>) {
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeChecked();
  for (const name of ["$ USD", "€ EUR"]) {
    const option = group.getByRole("radio", { name });
    await expect(option).toHaveAttribute("aria-disabled", "true");
    await option.click({ force: true });
    await expect(option).not.toBeChecked();
  }
  await expect(group.getByRole("radio", { name: "₺ TRY" })).toBeChecked();
}
async function noHorizontalScroll(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
}
async function noAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map((v) => [
      v.id,
      v.nodes.map((n) => n.target.join(" ") + " " + n.failureSummary),
    ]),
  ).toEqual([]);
}

test("Money: legacy entries are TRY, totals are exact and new/edited entries stay TRY", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4180/__test/seed", { data: legacyWorkspace() });
  await page.setViewportSize({ width: 390, height: 844 });
  const { saves, rateRequests } = watch(page);
  await login(page);
  await go(page, "Money");
  const summary = page.locator("dl").filter({ hasText: "Income" });
  await expect(page.getByRole("heading", { name: "This month" })).toBeVisible();
  await expect(summary).toContainText("Income₺30.000");
  await expect(summary).toContainText("Spent₺1.250");
  await expect(summary).toContainText("Left₺28.750");
  await expect(page.getByText(/Approximate|exchange rates/i)).toHaveCount(0);
  await expect(page.getByText("−₺1.250", { exact: true })).toBeVisible();

  // New expense: TRY is the only choice and is what gets saved.
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Quick add" });
  await expectOnlyTry(sheet.getByRole("radiogroup", { name: "Currency" }));
  await expect(sheet.getByText("USD and EUR become available")).toBeVisible();
  await expect(sheet.getByLabel("Amount (₺)", { exact: true })).toBeVisible();
  for (const key of ["4", "2", ".", "5"])
    await sheet.getByRole("button", { name: key, exact: true }).click();
  await sheet.getByRole("button", { name: "Food", exact: true }).click();
  await sheet.getByLabel("Note (optional)").fill("Lunch");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].schemaVersion).toBe(1);
  expect(saves[0].entries.map((e) => [e.id, e.amount, e.currency])).toEqual([
    [expect.any(String), 42.5, "TRY"],
    ["pay", 30000, "TRY"],
    ["food", 1250, "TRY"],
  ]);
  await expect(summary).toContainText("Spent₺1.293"); // 1250 + 42.50, whole lira as before

  // Editing keeps the stored currency; it cannot be switched.
  await page.getByRole("button", { name: "Edit Lunch", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit entry" });
  await expectOnlyTry(edit.getByRole("radiogroup", { name: "Currency" }));
  await expect(edit.getByText("A saved entry keeps its original currency.")).toBeVisible();
  await edit.getByRole("button", { name: "Delete last digit" }).click();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].entries.find((e) => e.amount === 42)?.currency).toBe("TRY");
  expect(rateRequests).toEqual([]); // TRY-only: no exchange rates needed or fetched

  // Survives a reload unchanged.
  await page.reload();
  await go(page, "Money");
  await expect(page.getByText("−₺42", { exact: true })).toBeVisible();
});

test("Goals: legacy goals stay TRY, new goals are TRY and progress is unchanged", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4180/__test/seed", { data: legacyWorkspace() });
  await page.setViewportSize({ width: 390, height: 844 });
  const { saves, rateRequests } = watch(page);
  await login(page);
  await go(page, "Goals");
  await expect(page.getByRole("img", { name: "Bike 25%" })).toBeVisible();
  await expect(page.getByText("₺2.500 / ₺10.000")).toBeVisible();

  await page.getByRole("button", { name: "Add goal", exact: true }).click();
  await page.getByLabel("Goal name").fill("Laptop");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Target (₺)", { exact: true })).toBeFocused();
  await expectOnlyTry(page.getByRole("radiogroup", { name: "Goal currency" }));
  await page.getByRole("button", { name: "₺25.000", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Saved (₺)", { exact: true }).fill("5000");
  await expect(page.getByRole("img", { name: "Laptop 20%" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Laptop", exact: true })).toBeVisible();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].schemaVersion).toBe(1);
  expect(saves[0].goals.map((g) => [g.target, g.saved, g.currency])).toEqual([
    [25000, 5000, "TRY"],
    [10000, 2500, "TRY"],
  ]);

  // Editing a goal keeps its currency and target as stored.
  await page.getByRole("button", { name: "Edit Bike", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Target (₺)", { exact: true })).toHaveValue("10000");
  await expectOnlyTry(page.getByRole("radiogroup", { name: "Goal currency" }));
  await expect(page.getByText("A goal keeps the currency it was created in.")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).last().click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  // Adding money stays in the goal's currency.
  await page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Bike", exact: true }) })
    .getByRole("button", { name: "Add money", exact: true })
    .last()
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Amount (₺)", { exact: true }).fill("2500");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("img", { name: "Bike 50%" })).toBeVisible();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].goals.find((g) => g.id === "bike")).toMatchObject({
    target: 10000,
    saved: 5000,
    currency: "TRY",
  });
  expect(rateRequests).toEqual([]);
});

test("Money and Goals currency controls are translated, accessible and fit 320px", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4180/__test/seed", { data: legacyWorkspace() });
  await page.setViewportSize({ width: 320, height: 640 });
  await login(page);
  await go(page, "Settings");
  await page.getByRole("radio", { name: "Türkçe", exact: true }).click();
  await go(page, "Para");
  await expect(page.getByRole("heading", { name: "Bu ay" })).toBeVisible();
  await expect(page.locator("dl")).toContainText("Kalan₺28.750");
  await noHorizontalScroll(page);
  await noAxeViolations(page);
  await page.getByRole("button", { name: "Gider ekle", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("radiogroup", { name: "Para birimi" })).toBeVisible();
  await expect(sheet.getByText("USD ve EUR, çoklu para birimi desteği açıldığında")).toBeVisible();
  await expect(sheet.getByLabel("Tutar (₺)", { exact: true })).toBeVisible();
  await noHorizontalScroll(page);
  await noAxeViolations(page);
  await page.keyboard.press("Escape");
  await go(page, "Hedefler");
  await page.getByRole("button", { name: "Hedef ekle", exact: true }).click();
  await page.getByLabel("Hedef adı").fill("Bisiklet");
  await page.getByRole("button", { name: "İleri", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "Hedef para birimi" })).toBeVisible();
  await noHorizontalScroll(page);
  await noAxeViolations(page);
});
