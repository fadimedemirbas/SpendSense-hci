import { expect, test, type Page } from "@playwright/test";
import { analyze, type Entry, type Goal, type Profile, type Purchase } from "../src/store";
import {
  FRESH_DATE,
  PROFILE,
  bulletinText,
  fitsAndIsAccessible,
  go,
  goDecide,
  legacyWorkspace,
  login,
  mixedWorkspace,
  mockRates,
  seed,
  watch,
} from "./currency-helpers";

// Home, Insights and Decide with records in TRY, USD and EUR (protocol 3).

test("Home and Insights: TRY-only figures are exactly as before, without rates", async ({
  page,
  request,
}) => {
  await seed(request, legacyWorkspace());
  await page.setViewportSize({ width: 390, height: 844 });
  const { rateRequests } = watch(page);
  await login(page);
  await expect(page.getByText("₺28.350", { exact: true })).toBeVisible();
  await expect(page.getByText("₺30.000", { exact: true })).toBeVisible();
  await expect(page.getByText("₺1.650", { exact: true })).toBeVisible();
  await expect(page.getByText("₺2.500 / ₺10.000")).toBeVisible();
  await go(page, "Insights");
  await expect(page.getByText("Food · ₺1.250", { exact: true })).toBeVisible();
  await expect(page.getByText("Transport · ₺400", { exact: true })).toBeVisible();
  await expect(page.getByText("Income · ₺30.000", { exact: true })).toBeVisible();
  await expect(page.getByText("Expenses · ₺1.650", { exact: true })).toBeVisible();
  await expect(page.getByText(/≈|Approximate|can't be calculated/)).toHaveCount(0);
  expect(rateRequests).toEqual([]);
});

test("Home and Insights: a mixed month is converted with dated, approximate totals", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByText("≈ ₺43.850", { exact: true })).toBeVisible();
  await expect(page.getByText("≈ ₺50.000", { exact: true })).toBeVisible();
  await expect(page.getByText("≈ ₺6.150", { exact: true })).toBeVisible();
  const note = `Approximate. Converted with TCMB rates from ${bulletinText(FRESH_DATE)}.`;
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByText("₺2.500 / ₺10.000")).toBeVisible(); // first active goal, in TRY

  await go(page, "Insights");
  // Largest first: Transport €100 (₺4.500), Food ₺1.250, Subscriptions $10 (₺400).
  const bars = page.locator("main").getByText(/ · ≈ ₺/);
  await expect(bars).toHaveText([
    "Transport · ≈ ₺4.500",
    "Food · ≈ ₺1.250",
    "Subscriptions · ≈ ₺400",
    "Income · ≈ ₺50.000",
    "Expenses · ≈ ₺6.150",
  ]);
  await expect(page.getByText(note)).toHaveCount(2);
});

test("Home and Insights: missing rates show amounts by currency", async ({ page, request }) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "missing");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(
    page.getByText(
      "Exchange rates are unavailable right now, so what's left this month can't be calculated. Amounts are shown by currency.",
    ),
  ).toBeVisible();
  await expect(page.getByText("₺30.000 + $500", { exact: true })).toBeVisible();
  await expect(page.getByText("₺1.250 + $10 + €100", { exact: true })).toBeVisible();
  await expect(page.getByText(/≈/)).toHaveCount(0);
  await go(page, "Insights");
  await expect(
    page.getByText(
      "This chart can't be calculated right now because exchange rates are unavailable. Amounts are shown by currency.",
    ),
  ).toHaveCount(2);
  await expect(page.getByText(/≈/)).toHaveCount(0);
});

test("Home and Insights: stale rates are used but flagged", async ({ page, request }) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "stale");
  await login(page);
  await expect(page.getByText("≈ ₺43.850", { exact: true })).toBeVisible();
  await expect(page.getByText("These rates may be out of date.")).toBeVisible();
  await go(page, "Insights");
  await expect(page.getByText("These rates may be out of date.")).toHaveCount(2);
});

// The lira inputs the scoring uses for a $60 purchase in the mixed month.
function expectedAnalysis() {
  const ws = mixedWorkspace();
  const lira = { TRY: 1, USD: 40, EUR: 45 } as const;
  const purchase: Purchase = {
    name: "Headphones",
    price: 2400,
    currency: "TRY",
    cat: "Shopping",
    reasons: ["need"],
    feeling: "Calm",
    own: false,
    usable: undefined,
    wait: "3d",
  };
  const entries = ws.entries.map((e) => ({
    ...e,
    amount: e.amount * lira[e.currency as keyof typeof lira],
    currency: "TRY",
  })) as Entry[];
  return analyze(purchase, ws.profile as Profile, ws.goals[0] as Goal, entries);
}
async function answerUsdPurchase(page: Page) {
  await goDecide(page);
  await page
    .getByRole("radiogroup", { name: "Currency" })
    .getByRole("radio", { name: "$ USD" })
    .click();
  await page.getByLabel("Product name").fill("Headphones");
  await page.getByLabel("Price ($)", { exact: true }).fill("60");
  await page.getByRole("button", { name: "Shopping", exact: true }).click();
  const next = () => page.getByRole("button", { name: "Next", exact: true }).click();
  await next();
  await page.getByRole("button", { name: "I need it", exact: true }).click();
  await next();
  await page.getByRole("button", { name: "Calm", exact: true }).click();
  await next();
  await page.getByRole("button", { name: "No", exact: true }).click();
  await next();
  await page.getByRole("button", { name: "3 days", exact: true }).click();
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
}

test("Decide: a USD purchase is scored on lira values and saved in dollars", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  const { saves } = watch(page);
  await login(page);
  await answerUsdPurchase(page);
  await expect(page.getByRole("heading", { level: 1, name: "Headphones" })).toBeFocused();
  await expect(page.locator("main p.f-num").first()).toHaveText("$60 · Shopping");
  const expected = expectedAnalysis();
  await expect(page.getByText(`${expected.fit}/100`, { exact: true })).toBeVisible();
  await expect(
    page.getByText(`Approximate. Converted with TCMB rates from ${bulletinText(FRESH_DATE)}.`),
  ).toBeVisible();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].schemaVersion).toBe(3);
  expect(saves[0].analyses[0].purchase).toMatchObject({ price: 60, currency: "USD" });
  expect(saves[0].analyses[0].result).toMatchObject({
    fit: expected.fit,
    budget: expected.budget,
    need: expected.need,
    goalImpact: expected.goalImpact,
    impulse: expected.impulse,
    pctIncome: expected.pctIncome,
  });

  // Buy: the expense and the decision stay in dollars.
  await page.getByRole("button", { name: "Buy", exact: true }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].entries[0]).toMatchObject({ name: "Headphones", amount: 60, currency: "USD" });
  expect(saves[1].decisions[0]).toMatchObject({ decision: "Buy", price: 60, currency: "USD" });
  await expect(page.getByText(/\$60/).first()).toBeVisible(); // History
  await go(page, "Money");
  await expect(page.getByText("−$60", { exact: true })).toBeVisible();
});

test("Decide: Wait keeps the dollar price on the waiting list", async ({ page, request }) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  const { saves } = watch(page);
  await login(page);
  await answerUsdPurchase(page);
  await page.getByRole("button", { name: "Wait", exact: true }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].waiting[0]).toMatchObject({ price: 60, currency: "USD" });
  await expect(page.getByRole("heading", { name: "Waiting List" })).toBeVisible();
  await expect(page.getByText(/\$60/).first()).toBeVisible();
});

test("Decide: without rates only the analysis is blocked, nothing is saved", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "missing");
  const { saves } = watch(page);
  await login(page);
  await answerUsdPurchase(page);
  const blocked =
    "Exchange rates are unavailable right now, so this purchase can't be compared with your budget and goals.";
  // Shown on the step (after Analyze) and in the live receipt.
  await expect(page.getByRole("list", { name: "Progress" }).getByText(blocked)).toBeVisible();
  await expect(page.getByText(blocked)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Analyze", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Headphones" })).toHaveCount(0);
  expect(saves).toEqual([]);
});

test("Decide: TRY purchases with TRY data score exactly as before", async ({ page, request }) => {
  await seed(request, legacyWorkspace());
  const { saves, rateRequests } = watch(page);
  await login(page);
  await goDecide(page);
  await expect(page.getByLabel("Price (₺)", { exact: true })).toBeVisible();
  await page.getByLabel("Product name").fill("Headphones");
  await page.getByLabel("Price (₺)", { exact: true }).fill("2499,90");
  await page.getByRole("button", { name: "Shopping", exact: true }).click();
  const next = () => page.getByRole("button", { name: "Next", exact: true }).click();
  await next();
  await page.getByRole("button", { name: "I need it", exact: true }).click();
  await next();
  await page.getByRole("button", { name: "Calm", exact: true }).click();
  await next();
  await page.getByRole("button", { name: "No", exact: true }).click();
  await next();
  await page.getByRole("button", { name: "3 days", exact: true }).click();
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.locator("main p.f-num").first()).toHaveText("₺2,499.90 · Shopping");
  const ws = legacyWorkspace();
  const expected = analyze(
    {
      name: "Headphones",
      price: 2499.9,
      currency: "TRY",
      cat: "Shopping",
      reasons: ["need"],
      feeling: "Calm",
      own: false,
      usable: undefined,
      wait: "3d",
    },
    { ...PROFILE, displayCurrency: "TRY" } as Profile,
    { ...ws.goals[0], currency: "TRY" } as Goal,
    ws.entries.map((e) => ({ ...e, currency: "TRY" })) as Entry[],
  );
  await expect(page.getByText(`${expected.fit}/100`, { exact: true })).toBeVisible();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].analyses[0].result).toMatchObject({ fit: expected.fit, budget: expected.budget });
  await expect(page.getByText(/Approximate/)).toHaveCount(0);
  expect(rateRequests).toEqual([]);
});

test("Money hands a USD expense to Decide with its amount and currency", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await login(page);
  await go(page, "Money");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Quick add" });
  await sheet
    .getByRole("radiogroup", { name: "Currency" })
    .getByRole("radio", { name: "$ USD" })
    .click();
  for (const key of ["6", "0"]) await sheet.getByRole("button", { name: key, exact: true }).click();
  await sheet.getByLabel("Note (optional)").fill("Desk lamp");
  await sheet.getByRole("button", { name: "Not bought yet? Check it first." }).click();
  await expect(page.getByLabel("Price ($)", { exact: true })).toHaveValue("60");
  await expect(page.getByLabel("Product name")).toHaveValue("Desk lamp");
  await expect(
    page.getByRole("radiogroup", { name: "Currency" }).getByRole("radio", { name: "$ USD" }),
  ).toBeChecked();
});

test("Home, Insights and Decide are translated, accessible and fit 320px", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 320, height: 640 });
  await login(page, "tr");
  await expect(page.getByRole("heading", { name: "Bu ay kalan" })).toBeVisible();
  await expect(page.getByText("≈ ₺43.850", { exact: true })).toBeVisible();
  await expect(page.getByText(/tarihli TCMB kurlarıyla çevrildi/)).toBeVisible();
  await fitsAndIsAccessible(page);
  await go(page, "İçgörüler");
  await expect(page.getByText("Gelir · ≈ ₺50.000", { exact: true })).toBeVisible();
  await fitsAndIsAccessible(page);
  await goDecide(page);
  await page
    .getByRole("radiogroup", { name: "Para birimi" })
    .getByRole("radio", { name: "€ EUR" })
    .click();
  await expect(page.getByLabel("Fiyat (€)", { exact: true })).toBeVisible();
  await expect(page.getByText(/Sent için virgül/)).toBeVisible();
  await fitsAndIsAccessible(page);
});
