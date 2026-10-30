import { expect, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Shared fixtures for the multi-currency browser tests (protocol 3).
// Exchange rates are served by a Playwright route, never by TCMB:
// midpoints 1 USD = ₺40 and 1 EUR = ₺45.

export const API = "http://127.0.0.1:4180";
export const SAVE = "/rest/v1/rpc/spendsense_save_workspace";
export const localDay = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const utcDay = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
/** How the app writes a bulletin date in English ("30 October 2026"). */
export const bulletinText = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
export const FRESH_DATE = utcDay(0);
export const STALE_DATE = utcDay(-10);

export const PROFILE = {
  email: "pwa-test@example.com",
  income: 1,
  savings: 1,
  habits: [0, 1, 2, 0],
  onboarded: true,
  currency: "symbol",
  displayCurrency: "TRY",
};

/**
 * A month in three currencies. In TRY: income 30.000 + 20.000 = 50.000,
 * spent 1.250 + 4.500 + 400 = 6.150, left 43.850.
 */
export const mixedWorkspace = (displayCurrency = "TRY") => ({
  profile: { ...PROFILE, displayCurrency },
  entries: [
    {
      id: "pay",
      type: "income",
      amount: 30000,
      currency: "TRY",
      cat: "Salary",
      name: "Pay",
      date: localDay(),
    },
    {
      id: "gig",
      type: "income",
      amount: 500,
      currency: "USD",
      cat: "Freelance",
      name: "Gig",
      date: localDay(),
    },
    {
      id: "food",
      type: "expense",
      amount: 1250,
      currency: "TRY",
      cat: "Food",
      name: "Market",
      date: localDay(),
    },
    {
      id: "trip",
      type: "expense",
      amount: 100,
      currency: "EUR",
      cat: "Transport",
      name: "Train",
      date: localDay(),
    },
    {
      id: "app",
      type: "expense",
      amount: 10,
      currency: "USD",
      cat: "Subscriptions",
      name: "App",
      date: localDay(),
    },
  ],
  goals: [
    { id: "bike", name: "Bike", target: 10000, saved: 2500, currency: "TRY", status: "Active" },
    { id: "rome", name: "Rome", target: 2000, saved: 500, currency: "EUR", status: "Active" },
  ],
  analyses: [],
  decisions: [],
  waiting: [],
});

/** Saved before multi-currency support: no currency fields at all (reads as TRY). */
export const legacyWorkspace = () => ({
  profile: { ...PROFILE, displayCurrency: undefined },
  entries: [
    { id: "pay", type: "income", amount: 30000, cat: "Salary", name: "Pay", date: localDay() },
    { id: "food", type: "expense", amount: 1250, cat: "Food", name: "Market", date: localDay() },
    { id: "bus", type: "expense", amount: 400, cat: "Transport", name: "Bus", date: localDay() },
  ],
  goals: [{ id: "bike", name: "Bike", target: 10000, saved: 2500, status: "Active" }],
  analyses: [],
  decisions: [],
  waiting: [],
});

export const seed = (request: APIRequestContext, data: unknown) =>
  request.post(`${API}/__test/seed`, { data });

/** Serves /api/rates like the Netlify function, or fails it. */
export async function mockRates(page: Page, mode: "fresh" | "stale" | "missing") {
  await page.route("**/api/rates", (route) =>
    mode === "missing"
      ? route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' })
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            rateType: "tcmb-forex-midpoint",
            snapshot: {
              source: "TCMB",
              bulletin: "2026/200",
              date: mode === "fresh" ? FRESH_DATE : STALE_DATE,
              rates: {
                USD: { buying: "39.9000", selling: "40.1000" },
                EUR: { buying: "44.9000", selling: "45.1000" },
              },
            },
          }),
        }),
  );
}

export type SavePayload = {
  schemaVersion: number;
  profile: Record<string, unknown>;
  entries: { id: string; amount: number; currency: string; name: string }[];
  goals: { id: string; target: number; saved: number; currency: string }[];
  analyses: { purchase: { price: number; currency: string }; result: Record<string, unknown> }[];
  decisions: { price: number; currency: string; decision: string }[];
  waiting: { price: number; currency: string }[];
};
export function watch(page: Page) {
  const saves: SavePayload[] = [];
  const rateRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(SAVE)) saves.push(JSON.parse(request.postData() ?? "{}").payload);
    if (request.url().includes("/api/rates")) rateRequests.push(request.url());
  });
  return { saves, rateRequests };
}

/** Signs in; `onboarded: false` accounts land on onboarding instead of the app. */
export async function login(page: Page, lang: "en" | "tr" = "en", onboarded = true) {
  if (lang === "tr") await page.addInitScript(() => localStorage.setItem("ss.lang", '"tr"'));
  await page.goto("/");
  const button = lang === "tr" ? "Giriş yap" : "Log in";
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.getByLabel(lang === "tr" ? "E-posta" : "Email", { exact: true }).fill(PROFILE.email);
  await page
    .getByLabel(lang === "tr" ? "Şifre" : "Password", { exact: true })
    .fill("test-only-password");
  await page.getByRole("button", { name: button, exact: true }).last().click();
  if (onboarded) await expect(page.locator("main")).toBeVisible();
}
export const go = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).first().click();
/** Third main navigation item is Decide in both layouts and languages. */
export const goDecide = (page: Page) =>
  page.locator("nav[aria-label] button").filter({ visible: true }).nth(2).click();

export async function fitsAndIsAccessible(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations.map((v) => [v.id, v.nodes.map((n) => n.target.join(" "))])).toEqual([]);
}
