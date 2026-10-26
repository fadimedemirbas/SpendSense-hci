import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Decide ("Should I buy it?") Batch 1: field validation, focus management,
// visible step position, receipt toggle name and accessible score cards.
const seed = (request: APIRequestContext) =>
  request.post("http://127.0.0.1:4180/__test/seed", {
    data: {
      profile: {
        email: "pwa-test@example.com",
        income: 1,
        savings: 1,
        habits: [0, 1, 2, 0],
        onboarded: true,
        currency: "symbol",
      },
      entries: [],
      goals: [{ id: crypto.randomUUID(), name: "Laptop", target: 20000, saved: 2000, status: "Active" }],
      analyses: [],
      decisions: [],
      waiting: [],
    },
  });
async function openDecide(page: Page, lang: "en" | "tr" = "en") {
  if (lang === "tr") await page.addInitScript(() => localStorage.setItem("ss.lang", '"tr"'));
  await page.goto("/");
  const login = lang === "tr" ? "Giriş yap" : "Log in";
  await page.getByRole("button", { name: login, exact: true }).click();
  await page.getByLabel(lang === "tr" ? "E-posta" : "Email", { exact: true }).fill("pwa-test@example.com");
  await page.getByLabel(lang === "tr" ? "Şifre" : "Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: login, exact: true }).last().click();
  await expect(page.locator("main")).toBeVisible();
  // Third main navigation item is Decide in both layouts and languages.
  await page.locator("nav[aria-label] button").filter({ visible: true }).nth(2).click();
}
const name = (page: Page) => page.getByLabel("Product name");
const price = (page: Page) => page.getByLabel("Price (₺)", { exact: true });
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true }).click();
const errorFor = async (page: Page, label: ReturnType<typeof name>) => {
  const id = await label.getAttribute("aria-describedby");
  expect(id).toBeTruthy();
  return page.locator(`[id="${id}"]`);
};

test.beforeEach(async ({ request }) => {
  await seed(request);
});

test("product name and price errors are field-specific, linked and focus the first invalid field", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDecide(page);
  await next(page);
  await expect(name(page)).toHaveAttribute("aria-invalid", "true");
  await expect(price(page)).toHaveAttribute("aria-invalid", "true");
  await expect(name(page)).toBeFocused();
  await expect(await errorFor(page, name(page))).toHaveText("Enter a product name.");
  await expect(await errorFor(page, price(page))).toHaveText("Enter a price above zero.");
  await expect(page.getByRole("alert")).toHaveCount(2);

  // Fixing one field clears only its own error; the next attempt focuses the other.
  await name(page).fill("Noise-cancelling headphones");
  await expect(name(page)).not.toHaveAttribute("aria-invalid");
  await expect(name(page)).not.toHaveAttribute("aria-describedby");
  await expect(price(page)).toHaveAttribute("aria-invalid", "true");
  await next(page);
  await expect(price(page)).toBeFocused();

  await price(page).fill("0");
  await price(page).press("Enter");
  await expect(price(page)).toBeFocused();
  await expect(await errorFor(page, price(page))).toHaveText("Enter a price above zero.");
  await price(page).fill("2499,90");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await price(page).press("Enter");
  await expect(page.getByRole("heading", { name: /Step 2 of 5/ })).toBeFocused();
});

test("Turkish field errors and step position", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openDecide(page, "tr");
  await expect(page.getByRole("heading", { name: /Adım 1 \/ 5/ })).toBeVisible();
  await page.getByRole("button", { name: "İleri", exact: true }).click();
  await expect(page.getByRole("alert").first()).toHaveText("Bir ürün adı gir.");
  await expect(page.getByRole("alert").last()).toHaveText("Sıfırdan büyük bir fiyat gir.");
  await expect(page.getByLabel("Ürün adı")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [390, 1280]) {
  test(`focus follows Next, Back, Edit and Analyze; step position is visible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openDecide(page);
    await expect(page.getByRole("heading", { name: /^Step 1 of 5/ })).toBeVisible();
    await name(page).fill("Noise-cancelling headphones");
    await price(page).fill("2500");
    await next(page);
    // The focused heading carries both the position and the question.
    const step2 = page.getByRole("heading", { name: "Step 2 of 5: Why do you want it?" });
    await expect(step2).toBeFocused();
    await expect(step2).toBeVisible();
    await page.getByRole("button", { name: "I need it", exact: true }).click();
    await next(page);
    await expect(page.getByRole("heading", { name: /^Step 3 of 5/ })).toBeFocused();
    await page.locator("main").getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Step 2 of 5/ })).toBeFocused();
    await next(page);
    await page.getByRole("button", { name: "Calm", exact: true }).click();
    await next(page);
    await expect(page.getByRole("heading", { name: /^Step 4 of 5/ })).toBeFocused();
    // Editing a completed answer from the summary list.
    await page.getByRole("button", { name: /^Edit: Feeling/ }).click();
    await expect(page.getByRole("heading", { name: /^Step 3 of 5/ })).toBeFocused();
    await next(page);
    await page.getByRole("button", { name: "No", exact: true }).click();
    await next(page);
    await page.getByRole("button", { name: "3 days", exact: true }).click();
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    const title = page.getByRole("heading", { level: 1, name: "Noise-cancelling headphones" });
    await expect(title).toBeFocused();
    // Edit returns to the form with focus on the first step.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Step 1 of 5/ })).toBeFocused();
    await expect(name(page)).toHaveValue("Noise-cancelling headphones");
  });
}

test("the mobile receipt toggle has a readable name and controls its panel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDecide(page);
  await name(page).fill("Headphones");
  await price(page).fill("2500");
  await next(page);
  const toggle = page.getByRole("button", {
    name: /^Purchase receipt: Headphones · ₺2\.500\s*, Step 2 of 5$/,
  });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const panel = page.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`);
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Purchase receipt");
});

test("score cards state each score as text and no longer pose as progress bars", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDecide(page);
  await name(page).fill("Headphones");
  await price(page).fill("2500");
  await next(page);
  await page.getByRole("button", { name: "It's on sale", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "Excited", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "No", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "24 hours", exact: true }).click();
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Headphones" })).toBeFocused();
  const main = page.locator("main");
  await expect(main.getByRole("progressbar")).toHaveCount(0);
  // Visible "n/25" and spoken "n out of 25" agree for all four factors.
  const cards = main.locator("section").filter({ has: page.getByRole("heading", { level: 2 }) });
  const pairs = await main.locator("span.f-num.text-xl").evaluateAll((spans) =>
    spans.map((span) => [
      span.textContent?.replace("/25", "").trim(),
      span.nextElementSibling?.textContent?.trim(),
    ]),
  );
  expect(pairs).toHaveLength(4);
  for (const [visible, spoken] of pairs) expect(spoken).toBe(`${visible} out of 25`);
  expect(await cards.count()).toBeGreaterThanOrEqual(4);
  // Overall fit keeps its accessible image label.
  await expect(main.getByRole("img", { name: /^Overall fit \d+\/100$/ })).toBeVisible();
});

for (const lang of ["en", "tr"] as const) {
  test(`every Decide step, error state and result meets WCAG AA (${lang})`, async ({ page }) => {
    const tr = (en: string, trText: string) => (lang === "tr" ? trText : en);
    const audit = async (state: string) => {
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({ state, id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await openDecide(page, lang);
    const nextButton = page.getByRole("button", { name: tr("Next", "İleri"), exact: true });
    await nextButton.click();
    await audit("step 1 with errors");
    await page.getByLabel(tr("Product name", "Ürün adı")).fill("Headphones");
    await page.getByLabel(`${tr("Price", "Fiyat")} (₺)`, { exact: true }).fill("2500");
    await nextButton.click();
    await page.locator("main button[aria-expanded]").first().click(); // open receipt
    await audit("step 2 with receipt open");
    await page.locator("button[aria-pressed]").first().click();
    await nextButton.click();
    await page.getByRole("button", { name: tr("Calm", "Sakin"), exact: true }).click();
    await nextButton.click();
    await page.getByRole("button", { name: tr("No", "Hayır"), exact: true }).click();
    await nextButton.click();
    await audit("step 5");
    await page.getByRole("button", { name: tr("3 days", "3 gün"), exact: true }).click();
    await page.getByRole("button", { name: tr("Analyze", "Analiz et"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Headphones" })).toBeFocused();
    await audit("result");
  });
}
