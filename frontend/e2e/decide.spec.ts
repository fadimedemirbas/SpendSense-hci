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
// The price field is also described by its format hint (Batch 3), so the error is
// the last id in aria-describedby.
const errorFor = async (page: Page, label: ReturnType<typeof name>) => {
  const ids = ((await label.getAttribute("aria-describedby")) ?? "").split(" ").filter(Boolean);
  expect(ids.length).toBeGreaterThan(0);
  return page.locator(`[id="${ids[ids.length - 1]}"]`);
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
    // Edit (Batch 3, D9) returns with every answer listed; focus is on the first one.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Edit: What/ })).toBeFocused();
    await expect(page.getByRole("heading", { name: /^Step 5 of 5/ })).toBeVisible();
    await page.getByRole("button", { name: /^Edit: What/ }).click();
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
    // English Decide amounts use English separators since Batch 3 (D2).
    name: /^Purchase receipt: Headphones · ₺2,500\s*, Step 2 of 5$/,
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

// ---- Batch 3: flow, error recovery and interaction ---------------------------
const API = "http://127.0.0.1:4180";
const workspace = async (request: APIRequestContext) =>
  (
    (await (await request.post(`${API}/rest/v1/rpc/spendsense_load_workspace`)).json()) as {
      workspace: {
        analyses: unknown[];
        waiting: { name: string; price: number; wait: string; review: string }[];
        decisions: { name: string; price: number; decision: string }[];
        entries: { name: string; amount: number; type: string }[];
      };
    }
  ).workspace;
async function toResult(page: Page, productName: string, typedPrice: string) {
  await name(page).fill(productName);
  await price(page).fill(typedPrice);
  await next(page);
  await page.getByRole("button", { name: "I need it", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "Calm", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "No", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "3 days", exact: true }).click();
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: productName })).toBeFocused();
}

for (const [lang, typed, shown] of [
  ["en", "129.95", "₺129.95"],
  ["en", "129,5", "₺129.50"],
  ["en", "2500", "₺2,500"],
  ["tr", "129,95", "₺129,95"],
  ["tr", "2500", "₺2.500"],
] as const) {
  test(`Decide shows ${typed} exactly as ${shown} (${lang})`, async ({ page, request }) => {
    await seedWith(request, [GOAL]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDecide(page, lang);
    const nameLabel = lang === "tr" ? "Ürün adı" : "Product name";
    const priceLabel = lang === "tr" ? "Fiyat (₺)" : "Price (₺)";
    await page.getByLabel(nameLabel).fill("Kettle");
    await page.getByLabel(priceLabel, { exact: true }).fill(typed);
    const receipt = page
      .locator("main section")
      .filter({ hasText: lang === "tr" ? "Alım fişi" : "Purchase receipt" });
    await expect(receipt.getByText(shown, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: lang === "tr" ? "İleri" : "Next", exact: true }).click();
    // Answer summary uses the same exact amount.
    await expect(
      page.getByRole("button", { name: new RegExp(`Kettle · ${shown.replace(/[.$]/g, "\\$&")}$`) }),
    ).toBeVisible();
  });
}

test("the exact price reaches the result screen and is saved unrounded", async ({
  page,
  request,
}) => {
  await seedWith(request, [GOAL]);
  await page.setViewportSize({ width: 390, height: 844 });
  await openDecide(page);
  await toResult(page, "Kettle", "129,95");
  await expect(page.locator("main p.f-num").first()).toHaveText(/^₺129\.95 · Shopping$/);
  await page.getByRole("button", { name: "Wait", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Waiting List", exact: true })).toBeVisible();
  const saved = await workspace(request);
  expect(saved.waiting[0]).toMatchObject({ name: "Kettle", price: 129.95, wait: "3d" });
});

test("the price hint is visible, translated and announced with the field", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openDecide(page);
  const hint = page.getByText(
    "Numbers only, without thousands separators. Use a comma or dot for kuruş, e.g. 1250 or 1250.50.",
  );
  await expect(hint).toBeVisible();
  const hintId = await hint.getAttribute("id");
  expect(await price(page).getAttribute("aria-describedby")).toBe(hintId);
  await next(page); // empty: the error is added, the hint stays linked
  const described = ((await price(page).getAttribute("aria-describedby")) ?? "").split(" ");
  expect(described).toContain(hintId);
  expect(described).toHaveLength(2);
  // Turkish
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("radio", { name: "Türkçe", exact: true }).click();
  await page.locator("nav[aria-label] button").filter({ visible: true }).nth(2).click();
  await expect(
    page.getByText(
      "Binlik ayırıcı olmadan yalnızca rakam gir. Kuruş için virgül ya da nokta kullan, örn. 1250 veya 1250,50.",
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [320, 390]) {
  test(`every earlier answer can be edited on a ${width}px phone without losing values`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await openDecide(page);
    await name(page).fill("Headphones");
    await price(page).fill("2500");
    await next(page);
    await page.getByRole("button", { name: "I need it", exact: true }).click();
    await next(page);
    await page.getByRole("button", { name: "Calm", exact: true }).click();
    await next(page);
    // Step 4: all three earlier answers are visible and editable.
    for (const label of [
      /^Edit: What · Headphones/,
      /^Edit: Why · I need it/,
      /^Edit: Feeling · Calm/,
    ])
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: /^Edit: What/ }).click();
    await expect(page.getByRole("heading", { name: /^Step 1 of 5/ })).toBeFocused();
    await expect(price(page)).toHaveValue("2500");
    await name(page).fill("Wireless headphones");
    await next(page);
    await expect(page.getByRole("button", { name: "I need it", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await next(page);
    await expect(page.getByRole("button", { name: "Calm", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("button", { name: /^Edit: What · Wireless headphones/ }),
    ).toBeVisible();
  });
}

test("Edit on the result lists every answer and only re-analyzes on Analyze", async ({
  page,
  request,
}) => {
  await seedWith(request, [GOAL]);
  await page.setViewportSize({ width: 390, height: 844 });
  await openDecide(page);
  await toResult(page, "Headphones", "2500");
  const before = (await workspace(request)).analyses.length;
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Edit: What · Headphones/ })).toBeFocused();
  for (const label of [/^Edit: Why/, /^Edit: Feeling/, /^Edit: Own/])
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Step 5 of 5/ })).toBeVisible();
  await expect(
    page.getByText(
      "You can change any answer above. Nothing is analyzed again until you press Analyze.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "3 days", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Change only the wait time: one tap, no new analysis yet.
  await page.getByRole("button", { name: "1 week", exact: true }).click();
  expect((await workspace(request)).analyses.length).toBe(before);
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Headphones" })).toBeFocused();
  await expect(page.getByText(/Waiting List for 1 week without buying anything/)).toBeVisible();
  expect((await workspace(request)).analyses.length).toBe(before + 1);
});

test("Cancel leaves without a dialog when nothing was entered and returns to the previous screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openDecide(page);
  // openDecide came from Home; go via Money to prove Cancel goes back, not always Home.
  await page.locator("nav[aria-label] button").filter({ visible: true }).nth(1).click();
  await page.locator("nav[aria-label] button").filter({ visible: true }).nth(2).click();
  await page.locator("main").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Money" })).toBeVisible();
});

test("Cancel with unsaved answers asks first; Keep editing preserves them", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDecide(page);
  await page.locator("nav[aria-label] button").filter({ visible: true }).nth(1).click();
  await page.locator("nav[aria-label] button").filter({ visible: true }).nth(2).click();
  await name(page).fill("Headphones");
  await price(page).fill("2500");
  const cancel = page.locator("main").getByRole("button", { name: "Cancel", exact: true });
  await cancel.click();
  const dialog = page.getByRole("alertdialog", { name: "Discard this purchase?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(cancel).toBeFocused();
  await expect(name(page)).toHaveValue("Headphones");
  await expect(price(page)).toHaveValue("2500");
  await cancel.click();
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Money" })).toBeVisible();
});

test("the Wait explanation is accurate, translated and Wait/Buy/Skip still save the same way", async ({
  page,
  request,
}) => {
  await seedWith(request, [GOAL]);
  await page.setViewportSize({ width: 390, height: 844 });
  await openDecide(page);
  await toResult(page, "Lamp", "800");
  const help = page.getByText(
    "Wait keeps it on your Waiting List for 3 days without buying anything. Then it is marked ready to revisit there, so you can decide again. Use Edit to change the wait time.",
  );
  await expect(help).toBeVisible();
  expect(
    await page.getByRole("button", { name: "Wait", exact: true }).getAttribute("aria-describedby"),
  ).toBe(await help.getAttribute("id"));
  await page.getByRole("button", { name: "Wait", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Waiting List", exact: true })).toBeVisible();
  let saved = await workspace(request);
  const due = new Date();
  due.setDate(due.getDate() + 3);
  expect(saved.waiting[0]).toMatchObject({
    name: "Lamp",
    price: 800,
    wait: "3d",
    review: due.toISOString().slice(0, 10),
  });
  expect(saved.entries).toHaveLength(0); // nothing was bought

  // Buy adds an expense; Skip adds only a decision.
  await page.locator("nav[aria-label] button").filter({ visible: true }).nth(2).click();
  await toResult(page, "Mug", "129,95");
  await page.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  saved = await workspace(request);
  expect(saved.entries[0]).toMatchObject({ name: "Mug", amount: 129.95, type: "expense" });
  await page.locator("nav[aria-label] button").filter({ visible: true }).nth(2).click();
  await toResult(page, "Poster", "300");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  saved = await workspace(request);
  expect(saved.decisions[0]).toMatchObject({ name: "Poster", decision: "Skip" });
  expect(saved.entries).toHaveLength(1);
});

test("Turkish microcopy: Duygu, Benzer ürün, Bekleme süresi and the Wait explanation", async ({
  page,
  request,
}) => {
  await seedWith(request, [GOAL]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openDecide(page, "tr");
  await page.getByLabel("Ürün adı").fill("Lamba");
  await page.getByLabel("Fiyat (₺)", { exact: true }).fill("800");
  const receipt = page.locator("main section").filter({ hasText: "Alım fişi" });
  for (const row of ["Duygu", "Benzer ürün", "Bekleme süresi"])
    await expect(receipt.getByText(row, { exact: true })).toBeVisible();
  await expect(receipt.getByText("His", { exact: true })).toHaveCount(0);
  await expect(receipt.getByText("Benzeri", { exact: true })).toHaveCount(0);
  const go = (n: string) => page.getByRole("button", { name: n, exact: true }).click();
  await go("İleri");
  await go("İhtiyacım var");
  await go("İleri");
  await go("Sakin");
  await go("İleri");
  await go("Hayır");
  await go("İleri");
  await go("3 gün");
  // The wait-time answer no longer reads like the Wait decision.
  await expect(page.getByRole("button", { name: /^Düzenle: Duygu · Sakin/ })).toBeVisible();
  await go("Analiz et");
  await expect(
    page.getByText(
      "Bekle, hiçbir şey satın almadan ürünü 3 gün boyunca Bekleme Listende tutar. Süre dolunca orada tekrar bakmaya hazır olarak görünür ve yeniden karar verebilirsin. Bekleme süresini değiştirmek için Düzenle'yi kullan.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Bekle", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Düzenle: Bekleme süresi/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Düzenle: Ne\?/ })).toBeFocused();
});

for (const lang of ["en", "tr"] as const) {
  test(`Batch 3 states meet WCAG AA (${lang})`, async ({ page, request }) => {
    await seedWith(request, [GOAL]);
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
    await audit("step 1 with price hint");
    const tr = (en: string, trText: string) => (lang === "tr" ? trText : en);
    await page.getByLabel(tr("Product name", "Ürün adı")).fill("Kettle");
    await page.getByLabel(`${tr("Price", "Fiyat")} (₺)`, { exact: true }).fill("129,95");
    await page
      .locator("main")
      .getByRole("button", { name: tr("Cancel", "Vazgeç"), exact: true })
      .click();
    await audit("discard dialog");
    await page.getByRole("button", { name: tr("Keep editing", "Düzenlemeye devam et") }).click();
    const go = (n: string) => page.getByRole("button", { name: n, exact: true }).click();
    await go(tr("Next", "İleri"));
    await go(tr("I need it", "İhtiyacım var"));
    await go(tr("Next", "İleri"));
    await go(tr("Calm", "Sakin"));
    await go(tr("Next", "İleri"));
    await go(tr("No", "Hayır"));
    await go(tr("Next", "İleri"));
    await go(tr("3 days", "3 gün"));
    await go(tr("Analyze", "Analiz et"));
    await expect(page.getByRole("heading", { level: 1, name: "Kettle" })).toBeFocused();
    await audit("result with Wait help");
    await go(tr("Edit", "Düzenle"));
    await audit("editing from result");
  });
}
