import { expect, test, type Page } from "@playwright/test";
import {
  fitsAndIsAccessible,
  go,
  localDay,
  login,
  mixedWorkspace,
  mockRates,
  seed,
  watch,
} from "./currency-helpers";

// The Money category filter and Insights' Decision patterns without redundant UI.

const EXPENSES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Fun",
  "Health",
  "Groceries",
  "Education",
  "Subscriptions",
  "Clothing",
  "Personal care",
  "Other",
];
const INCOME = [
  "Salary",
  "Side income",
  "Gift",
  "Scholarship",
  "Freelance",
  "Investment",
  "Refund",
  "Other",
];
const SAVINGS = ["Salary surplus", "Gold", "Silver", "Crypto", "Other"];

const decision = (id: string, feeling: string, reasons: string[]) => ({
  id,
  name: id,
  price: 100,
  currency: "TRY",
  cat: "Shopping",
  reasons,
  feeling,
  own: false,
  wait: "24h",
  decision: "Skip",
  date: localDay(-3),
  fit: 50,
});

const patternsWorkspace = () => ({
  ...mixedWorkspace(),
  decisions: [
    decision("d1", "Excited", ["sale"]),
    decision("d2", "Excited", ["sale", "need"]),
    decision("d3", "Calm", ["need"]),
  ],
});

const options = (page: Page, lang: "en" | "tr") =>
  page
    .getByRole("combobox", { name: lang === "tr" ? "Kategori" : "Category", exact: true })
    .locator("option");

for (const lang of ["en", "tr"] as const)
  for (const [device, width] of [
    ["mobile", 320],
    ["desktop", 1280],
  ] as const)
    test(`Money filter has no Home option, every category stays selectable (${lang}, ${device})`, async ({
      page,
      request,
    }) => {
      await seed(request, mixedWorkspace());
      await mockRates(page, "fresh");
      await page.setViewportSize({ width, height: 800 });
      await login(page, lang);
      await go(page, lang === "tr" ? "Para" : "Money");
      const filter = page.getByRole("combobox", {
        name: lang === "tr" ? "Kategori" : "Category",
        exact: true,
      });
      await expect(filter.locator('option[value="Home"]')).toHaveCount(0);
      await expect(options(page, lang).filter({ hasText: /^(Home|Ana Sayfa|Ev)$/ })).toHaveCount(0);
      const values = await options(page, lang).evaluateAll((xs) =>
        xs.map((x) => (x as HTMLOptionElement).value),
      );
      expect(values).toEqual(["all", ...new Set([...EXPENSES, ...INCOME, ...SAVINGS])]);
      for (const [type, list] of [
        [lang === "tr" ? "Giderler" : "Expenses", EXPENSES],
        [lang === "tr" ? "Gelir" : "Income", INCOME],
        [lang === "tr" ? "Birikimler" : "Savings", SAVINGS],
      ] as const) {
        await page.getByRole("radio", { name: type, exact: true }).click();
        await expect(filter.locator('option[value="Home"]')).toHaveCount(0);
        const shown = await options(page, lang).evaluateAll((xs) =>
          xs.map((x) => (x as HTMLOptionElement).value),
        );
        expect(shown).toEqual(["all", ...list]);
        for (const value of list) {
          await filter.selectOption(value);
          await expect(filter).toHaveValue(value);
        }
        await filter.selectOption("all");
      }
      // The Home page and its navigation item are untouched.
      await go(page, lang === "tr" ? "Ana Sayfa" : "Home");
      await expect(
        page.getByRole("heading", { name: lang === "tr" ? "Bu ay kalan" : "Left this month" }),
      ).toBeVisible();
      await fitsAndIsAccessible(page);
    });

for (const lang of ["en", "tr"] as const)
  test(`entries in the Home category keep their data and read as ${lang === "tr" ? "Ev" : "Home"} (${lang})`, async ({
    page,
    request,
  }) => {
    const ws = mixedWorkspace();
    const lamp = {
      id: "lamp",
      type: "expense",
      amount: 300,
      currency: "TRY",
      cat: "Home",
      name: "Lamp",
      date: localDay(),
    };
    await seed(request, { ...ws, entries: [...ws.entries, lamp] });
    await mockRates(page, "fresh");
    const { saves } = watch(page);
    await login(page, lang);
    const label = lang === "tr" ? "Ev" : "Home";
    // The navigation keeps its own label.
    await expect(
      page.getByRole("button", { name: lang === "tr" ? "Ana Sayfa" : "Home", exact: true }).first(),
    ).toBeVisible();
    await go(page, lang === "tr" ? "Para" : "Money");
    const filter = page.getByRole("combobox", {
      name: lang === "tr" ? "Kategori" : "Category",
      exact: true,
    });
    const option = filter.locator('option[value="Home"]');
    await expect(option).toHaveCount(1);
    await expect(option).toHaveText(label);
    await filter.selectOption("Home");
    await expect(page.getByText("Lamp", { exact: true })).toBeVisible();
    await expect(page.getByText(`${label} · ${lang === "tr" ? "Bugün" : "Today"}`)).toBeVisible();
    await expect(page.getByText("Train", { exact: true })).toHaveCount(0);
    // The expense picker offers the same category under the same label.
    await page
      .getByRole("button", { name: lang === "tr" ? "Gider ekle" : "Add expense", exact: true })
      .first()
      .click();
    await expect(page.getByRole("dialog").getByText(label, { exact: true })).toBeVisible();
    if (lang === "tr")
      await expect(page.getByRole("dialog").getByText("Ana Sayfa", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    // Nothing was written: the record keeps its "Home" identifier.
    expect(saves).toEqual([]);
  });

for (const lang of ["en", "tr"] as const)
  for (const [device, width] of [
    ["mobile", 320],
    ["desktop", 1280],
  ] as const)
    test(`Decision patterns keep their counts without the calculation note (${lang}, ${device})`, async ({
      page,
      request,
    }) => {
      await seed(request, patternsWorkspace());
      await mockRates(page, "fresh");
      await page.setViewportSize({ width, height: 900 });
      await login(page, lang);
      await go(page, lang === "tr" ? "İçgörüler" : "Insights");
      const heading = page.getByRole("heading", {
        name: lang === "tr" ? "Karar örüntüleri" : "Decision patterns",
      });
      const card = heading.locator("xpath=../..");
      await expect(card).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: lang === "tr" ? "Bu nasıl hesaplandı?" : "How was this calculated?",
        }),
      ).toHaveCount(0);
      await expect(
        page.getByText(lang === "tr" ? /karar ve bekleyen öğedeki/ : /Counts of feelings/),
      ).toHaveCount(0);
      const excited = lang === "tr" ? "Heyecanlı" : "Excited";
      const calm = lang === "tr" ? "Sakin" : "Calm";
      const sale = lang === "tr" ? "İndirimde" : "It's on sale";
      const need = lang === "tr" ? "İhtiyacım var" : "I need it";
      for (const pill of [`${excited} · 2`, `${calm} · 1`, `${sale} · 2`, `${need} · 2`])
        await expect(card.getByText(pill, { exact: true })).toBeVisible();
      await expect(
        card.getByText(lang === "tr" ? /^En sık neden:/ : /^Most common reason:/),
      ).toBeVisible();
      // The card's own info tip is kept.
      await expect(
        page.getByRole("button", {
          name: lang === "tr" ? "Karar örüntüleri hakkında bilgi" : "Info about Decision patterns",
        }),
      ).toHaveCount(1);
      await fitsAndIsAccessible(page);
    });
