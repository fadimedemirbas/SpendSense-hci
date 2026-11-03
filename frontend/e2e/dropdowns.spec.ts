import { expect, test, type Locator } from "@playwright/test";
import {
  fitsAndIsAccessible,
  go,
  legacyWorkspace,
  login,
  mockRates,
  seed,
  watch,
} from "./currency-helpers";

async function comfortableControl(select: Locator) {
  const metrics = await select.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const arrow = element.closest(".select-wrap")!.querySelector(".select-chevron")!;
    const icon = arrow.getBoundingClientRect();
    return {
      height: box.height,
      fontSize: parseFloat(getComputedStyle(element).fontSize),
      verticalOffset: Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2),
      rightInset: box.right - icon.x - icon.width / 2,
      pickerIcon: CSS.supports("appearance", "base-select")
        ? getComputedStyle(element, "::picker-icon").display
        : null,
    };
  });
  expect(metrics.height).toBeGreaterThanOrEqual(48);
  expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(metrics.verticalOffset).toBeLessThanOrEqual(1);
  expect(metrics.rightInset).toBeCloseTo(24, 0);
  if (metrics.pickerIcon !== null) expect(metrics.pickerIcon).toBe("none");
}

test.beforeEach(async ({ page, request }) => {
  await seed(request, legacyWorkspace());
  await mockRates(page, "fresh");
});

test("dark dropdowns have roomy options and preserve profile, grouped choices and filters", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem("ss.theme", "dark"));
  const { saves } = watch(page);
  await login(page);
  await go(page, "Settings");
  const income = page.getByRole("combobox", { name: "Monthly income", exact: true });
  const savings = page.getByRole("combobox", { name: "Monthly savings", exact: true });
  const section = page.getByRole("region", { name: "Delete confirmation", exact: true });
  const category = section.getByRole("combobox", { name: "Category", exact: true });
  for (const select of [income, savings, category]) await comfortableControl(select);

  if (await page.evaluate(() => CSS.supports("appearance", "base-select"))) {
    await income.click();
    const option = income.locator('option[value="2"]');
    await expect(option).toBeVisible();
    expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await option.click();
  } else await income.selectOption("2");
  await expect(income).toHaveValue("2");
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].profile.income).toBe(2);
  await savings.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(savings).toHaveValue("2");
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].profile).toMatchObject({ income: 2, savings: 2 });

  await expect(
    category.locator('optgroup[label="Expenses"] option[value="expense:Food"]'),
  ).toHaveCount(1);
  await category.selectOption("expense:Food");
  await section.getByRole("button", { name: "Add", exact: true }).click();
  await expect(section.getByRole("listitem")).toHaveText(["Food (Expense)"]);
  await expect(category.locator('option[value="expense:Food"]')).toHaveCount(0);

  await go(page, "Money");
  const filter = page.getByRole("combobox", { name: "Category", exact: true });
  await comfortableControl(filter);
  await filter.selectOption("Food");
  await expect(page.getByText("Market", { exact: true })).toBeVisible();
  await expect(page.getByText("Bus", { exact: true })).toHaveCount(0);
  await filter.selectOption("all");
  await expect(page.getByText("Bus", { exact: true })).toBeVisible();
  await fitsAndIsAccessible(page);
});

test("Turkish dropdowns and open pickers fit a 320px light-theme screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => localStorage.setItem("ss.theme", "light"));
  await login(page, "tr");
  await go(page, "Ayarlar");
  const income = page.getByRole("combobox", { name: "Aylık gelir", exact: true });
  const savings = page.getByRole("combobox", { name: "Aylık birikim", exact: true });
  const category = page
    .getByRole("region", { name: "Silme onayı", exact: true })
    .getByRole("combobox", { name: "Kategori", exact: true });
  for (const select of [income, savings, category]) await comfortableControl(select);

  if (await page.evaluate(() => CSS.supports("appearance", "base-select"))) {
    for (const select of [income, category]) {
      await select.click();
      const option = select.locator("option").nth(1);
      await expect(option).toBeVisible();
      const box = (await option.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(740);
      await page.keyboard.press("Escape");
    }
  }
  await fitsAndIsAccessible(page);
});
