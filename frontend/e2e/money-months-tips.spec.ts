import { expect, test, type Page } from "@playwright/test";
import {
  fitsAndIsAccessible,
  go,
  login,
  mixedWorkspace,
  mockRates,
  seed,
  watch,
} from "./currency-helpers";

// Money lists one month at a time; cards explain themselves with an info bubble;
// entry actions are quiet icon buttons.

const monthName = (offset: number, lang: "en" | "tr" = "en") => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return date.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US", {
    month: "long",
    year: "numeric",
  });
};
/** A date inside the month `offset` months away. */
const dayIn = (offset: number) => {
  const date = new Date();
  date.setDate(10);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-10`;
};
const workspace = () => {
  const ws = mixedWorkspace();
  ws.entries.push(
    {
      id: "last",
      type: "expense",
      amount: 300,
      currency: "TRY",
      cat: "Fun",
      name: "Cinema",
      date: dayIn(-1),
    },
    {
      id: "old",
      type: "income",
      amount: 1500.5,
      currency: "TRY",
      cat: "Gift",
      name: "Birthday",
      date: dayIn(-3),
    },
  );
  return ws;
};
const switcher = (page: Page) => page.getByRole("navigation", { name: "Month" });

test("Money shows one month at a time and moves between months", async ({ page, request }) => {
  await seed(request, workspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await go(page, "Money");
  const nav = switcher(page);
  await expect(nav.getByRole("heading", { name: monthName(0) })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Next month" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "This month" })).toBeVisible();
  await expect(page.getByText("Market", { exact: true })).toBeVisible();
  await expect(page.getByText("Cinema", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to this month" })).toHaveCount(0);

  // Last month: only its entries and its own totals.
  await nav.getByRole("button", { name: "Previous month" }).click();
  await expect(nav.getByRole("heading", { name: monthName(-1) })).toBeVisible();
  await expect(page.getByText("Cinema", { exact: true })).toBeVisible();
  await expect(page.getByText("Market", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Month summary" })).toBeVisible();
  const summary = page.locator("dl").filter({ hasText: "Income" }).first();
  await expect(summary).toContainText("Spent₺300");
  await expect(summary).toContainText("Left−₺300");

  // A month with nothing in it, then the oldest month (no earlier month to open).
  await nav.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByText(`No entries in ${monthName(-2)}.`)).toBeVisible();
  await nav.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByText("Birthday", { exact: true })).toBeVisible();
  await expect(page.getByText("+₺1.500,50", { exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Previous month" })).toBeDisabled();

  // Filters still apply within the month; the shortcut returns to the current month.
  await page.getByRole("radio", { name: "Expenses", exact: true }).click();
  await expect(page.getByText("Birthday", { exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Back to this month" }).click();
  await expect(nav.getByRole("heading", { name: monthName(0) })).toBeVisible();
  await expect(page.getByText("Market", { exact: true })).toBeVisible();
  await fitsAndIsAccessible(page);
});

test("month names and controls are translated", async ({ page, request }) => {
  await seed(request, workspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 320, height: 700 });
  await login(page, "tr");
  await go(page, "Para");
  const nav = page.getByRole("navigation", { name: "Ay" });
  await expect(nav.getByRole("heading", { name: monthName(0, "tr") })).toBeVisible();
  await nav.getByRole("button", { name: "Önceki ay" }).click();
  await expect(nav.getByRole("heading", { name: monthName(-1, "tr") })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ay özeti" })).toBeVisible();
  await page.getByRole("button", { name: "Bu aya dön" }).click();
  await expect(page.getByRole("heading", { name: "Bu ay" })).toBeVisible();
  await fitsAndIsAccessible(page);
});

test("entry actions are quiet icon buttons that still edit and delete", async ({
  page,
  request,
}) => {
  await seed(request, workspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 320, height: 700 });
  const { saves } = watch(page);
  await login(page);
  await go(page, "Money");
  const edit = page.getByRole("button", { name: "Edit Market", exact: true });
  const remove = page.getByRole("button", { name: "Delete Market", exact: true });
  for (const button of [edit, remove]) {
    const style = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return { bg: s.backgroundColor, border: s.borderTopWidth, w: box.width, h: box.height };
    });
    expect(style.bg).toBe("rgba(0, 0, 0, 0)"); // no filled pill
    expect(style.border).toBe("0px");
    expect(style.w).toBeGreaterThanOrEqual(24); // WCAG 2.5.8 target size
    expect(style.h).toBeGreaterThanOrEqual(24);
  }
  // On a phone they sit under the amount instead of on a row of their own.
  const row = page.locator("li").filter({ hasText: "Market" });
  const amountBox = await row.getByText("−₺1.250", { exact: true }).boundingBox();
  const editBox = await edit.boundingBox();
  expect(editBox!.y - (amountBox!.y + amountBox!.height)).toBeLessThan(24);
  await edit.click();
  await expect(page.getByRole("dialog", { name: "Edit entry" })).toBeVisible();
  await page.keyboard.press("Escape");
  await remove.click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].entries.some((e) => e.id === "food")).toBe(false);
  await expect(page.getByText("Entry deleted.")).toBeVisible();
});

test("info buttons open SpendSense's own tooltip by hover, keyboard and tap", async ({
  page,
  request,
}) => {
  await seed(request, workspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  await go(page, "Insights");
  const info = page.getByRole("button", { name: "Info about Spending by category" });
  await expect(info).not.toHaveAttribute("title"); // not the browser's tooltip
  const text = "Your five largest expense categories this month and their share of all spending.";

  // Hover shows it; it stays while the pointer moves onto it; leaving closes it.
  await info.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toHaveText(text);
  await expect(info).toHaveAttribute("aria-describedby", (await tip.getAttribute("id"))!);
  await tip.hover();
  await expect(tip).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);

  // Keyboard focus shows it, Escape hides it.
  await info.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await fitsAndIsAccessible(page);
});

for (const [theme, width] of [
  ["light", 320],
  ["dark", 320],
  ["dark", 1280],
] as const)
  test(`tooltips stay on screen and are accessible (${theme}, ${width}px)`, async ({
    page,
    request,
  }) => {
    await seed(request, workspace());
    await mockRates(page, "fresh");
    await page.addInitScript((value) => localStorage.setItem("ss.theme", value), theme);
    await page.setViewportSize({ width, height: 760 });
    await login(page);
    const check = async (name: string) => {
      const info = page.getByRole("button", { name: `Info about ${name}` }).first();
      await info.scrollIntoViewIfNeeded();
      await info.click(); // a tap pins it open
      const tip = page.getByRole("tooltip");
      await expect(tip).toBeVisible();
      const box = (await tip.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await fitsAndIsAccessible(page);
      await info.click(); // a second tap closes it
      await expect(tip).toHaveCount(0);
    };
    await check("Left this month");
    await check("Bike");
    await go(page, "Money");
    await expect(page.getByRole("heading", { name: "This month" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Info about This month" })).toHaveCount(0);
    await go(page, "Goals");
    await check("Rome");
    await go(page, "Insights");
    await check("How decisions felt later");
    // A tap elsewhere closes a pinned tooltip.
    await page.getByRole("button", { name: "Info about Income vs. expenses" }).click();
    await page.getByRole("heading", { name: "Insights", level: 1 }).click();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

test("tooltips are translated", async ({ page, request }) => {
  await seed(request, workspace());
  await mockRates(page, "fresh");
  await login(page, "tr");
  await page.getByRole("button", { name: "Bu ay kalan hakkında bilgi" }).click();
  await expect(page.getByRole("tooltip")).toContainText("Bu takvim ayındaki gelirden");
});
