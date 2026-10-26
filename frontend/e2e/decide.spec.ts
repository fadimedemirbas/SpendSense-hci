import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { analyze, level, type Entry, type Goal, type Profile, type Purchase } from "../src/store";
import { outcomeLabel, type Factor } from "../src/lib/decideLabels";

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
      goals: [
        { id: crypto.randomUUID(), name: "Laptop", target: 20000, saved: 2000, status: "Active" },
      ],
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
  await page
    .getByLabel(lang === "tr" ? "E-posta" : "Email", { exact: true })
    .fill("pwa-test@example.com");
  await page
    .getByLabel(lang === "tr" ? "Şifre" : "Password", { exact: true })
    .fill("test-only-password");
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
  const pairs = await main
    .locator("span.f-num.text-xl")
    .evaluateAll((spans) =>
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

// ---- Batch 2: clarity and consistency of results (display only) ----------
const PROFILE: Profile = {
  email: "pwa-test@example.com",
  income: 1,
  savings: 1,
  habits: [0, 1, 2, 0],
  onboarded: true,
  currency: "symbol",
};
const GOAL: Goal = {
  id: "goal-laptop",
  name: "Laptop",
  target: 20000,
  saved: 2000,
  status: "Active",
};
const thisMonth = () => new Date().toISOString().slice(0, 10);
const seedWith = (request: APIRequestContext, goals: Goal[], entries: Entry[] = []) =>
  request.post("http://127.0.0.1:4180/__test/seed", {
    data: { profile: PROFILE, entries, goals, analyses: [], decisions: [], waiting: [] },
  });
type Scenario = { purchase: Purchase; reasons: string[]; feeling: string; wait: string };
// Mostly favourable and mostly unfavourable answers, so both directions are covered.
const CALM: Scenario = {
  purchase: {
    name: "Library card",
    price: 100,
    cat: "Shopping",
    reasons: ["need"],
    feeling: "Calm",
    own: false,
    wait: "1w",
  },
  reasons: ["I need it"],
  feeling: "Calm",
  wait: "1 week",
};
const IMPULSIVE: Scenario = {
  purchase: {
    name: "Designer jacket",
    price: 15000,
    cat: "Shopping",
    reasons: ["sale", "attention", "reward"],
    feeling: "Excited",
    own: false,
    wait: "24h",
  },
  reasons: ["It's on sale", "It caught my eye", "Treating myself"],
  feeling: "Excited",
  wait: "24 hours",
};
async function runScenario(page: Page, scenario: Scenario) {
  await name(page).fill(scenario.purchase.name);
  await price(page).fill(String(scenario.purchase.price));
  await next(page);
  for (const reason of scenario.reasons)
    await page.getByRole("button", { name: reason, exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: scenario.feeling, exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "No", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: scenario.wait, exact: true }).click();
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: scenario.purchase.name })).toBeFocused();
}
const FACTORS: [Factor, "budget" | "need" | "goalImpact" | "impulse"][] = [
  ["Budget fit", "budget"],
  ["Need level", "need"],
  ["Goal impact", "goalImpact"],
  ["Impulse signals", "impulse"],
];
const card = (page: Page, factor: string) =>
  page
    .locator("main section")
    .filter({ has: page.getByRole("heading", { level: 2, name: factor, exact: true }) });

for (const [label, scenario] of [
  ["favourable", CALM],
  ["unfavourable", IMPULSIVE],
] as const) {
  test(`outcome labels follow each factor's direction and scores are unchanged (${label})`, async ({
    page,
    request,
  }) => {
    await seedWith(request, [GOAL]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDecide(page);
    await runScenario(page, scenario);
    const expected = analyze(scenario.purchase, PROFILE, GOAL, []);
    await expect(page.getByRole("img", { name: `Overall fit ${expected.fit}/100` })).toBeVisible();
    for (const [factor, key] of FACTORS) {
      const score = expected[key];
      await expect(card(page, factor).locator("span.f-num.text-xl")).toHaveText(`${score}/25`);
      const pill = card(page, factor).locator("span.rounded-full").first();
      await expect(pill).toHaveText(outcomeLabel(factor, level(score) as never, true));
      await expect(pill).not.toHaveText(/^(High|Medium|Low)$/);
    }
  });
}

test("Turkish outcome labels and context wording", async ({ page, request }) => {
  await seedWith(request, [GOAL]);
  await page.setViewportSize({ width: 390, height: 844 });
  await openDecide(page, "tr");
  await page.getByLabel("Ürün adı").fill("Tasarım ceket");
  await page.getByLabel("Fiyat (₺)", { exact: true }).fill("15000");
  await page.getByRole("button", { name: "İleri", exact: true }).click();
  for (const reason of ["İndirimde", "Gözüme çarptı", "Kendimi ödüllendirmek"])
    await page.getByRole("button", { name: reason, exact: true }).click();
  await page.getByRole("button", { name: "İleri", exact: true }).click();
  await page.getByRole("button", { name: "Heyecanlı", exact: true }).click();
  await page.getByRole("button", { name: "İleri", exact: true }).click();
  await page.getByRole("button", { name: "Hayır", exact: true }).click();
  await page.getByRole("button", { name: "İleri", exact: true }).click();
  await page.getByRole("button", { name: "24 saat", exact: true }).click();
  await page.getByRole("button", { name: "Analiz et", exact: true }).click();
  const expected = analyze(IMPULSIVE.purchase, PROFILE, GOAL, []);
  const TR: Record<string, string> = {
    "Fits well": "Rahatça uyuyor",
    "Fits, but tight": "Uyuyor ama sınırda",
    "Stretches budget": "Bütçeyi zorluyor",
    "Strong need": "Güçlü ihtiyaç",
    "Some need": "Orta düzey ihtiyaç",
    "Little need": "Az ihtiyaç",
    "Large impact": "Büyük etki",
    "Moderate impact": "Orta düzey etki",
    "Small impact": "Küçük etki",
    "Many signals": "Çok sayıda sinyal",
    "Some signals": "Birkaç sinyal",
    "Few signals": "Az sinyal",
  };
  const trNames: Record<Factor, string> = {
    "Budget fit": "Bütçe uyumu",
    "Need level": "İhtiyaç düzeyi",
    "Goal impact": "Hedef etkisi",
    "Impulse signals": "Anlık istek sinyalleri",
  };
  for (const [factor, key] of FACTORS)
    await expect(card(page, trNames[factor]).locator("span.rounded-full").first()).toHaveText(
      TR[outcomeLabel(factor, level(expected[key]) as never)],
    );
  await expect(page.getByText("Aylık gelire oranı", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("goal impact says there is no active goal, and the context row names its own measure", async ({
  page,
  request,
}) => {
  await seedWith(request, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await openDecide(page);
  await runScenario(page, CALM);
  await expect(card(page, "Goal impact").locator("span.rounded-full").first()).toHaveText(
    "No active goal",
  );
  const context = page
    .locator("main section")
    .filter({ has: page.getByRole("heading", { name: "Context", exact: true }) });
  await expect(context.getByText("Share of monthly income", { exact: true })).toBeVisible();
  await expect(context.getByText("Budget fit", { exact: true })).toHaveCount(0);
  // The overall-fit explanation now appears once, with no duplicate tooltip button.
  await expect(
    page.locator("main").getByText("Higher means more aligned with your current context."),
  ).toHaveCount(1);
  await expect(page.locator("main").getByRole("button", { name: "More info" })).toHaveCount(0);
});

for (const withIncome of [false, true]) {
  test(`the receipt ${withIncome ? "uses real income without" : "labels the onboarding"} estimate`, async ({
    page,
    request,
  }) => {
    const entries: Entry[] = withIncome
      ? [
          {
            id: "income-1",
            type: "income",
            name: "Salary",
            amount: 30000,
            cat: "Salary",
            date: thisMonth(),
          },
        ]
      : [];
    await seedWith(request, [GOAL], entries);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDecide(page);
    await name(page).fill("Headphones");
    await price(page).fill("2500");
    const receipt = page.locator("main section").filter({ hasText: "Purchase receipt" });
    const expected = analyze({ ...CALM.purchase, price: 2500 }, PROFILE, undefined, entries);
    const percent = Math.round((2500 / expected.income) * 100);
    await expect(receipt.getByText(`That's ${percent}% of what's left this month.`)).toBeVisible();
    const note = receipt.getByText("Estimate based on your onboarding ranges.");
    if (withIncome) await expect(note).toHaveCount(0);
    else await expect(note).toBeVisible();
  });
}
