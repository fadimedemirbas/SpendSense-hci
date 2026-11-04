import { expect, test, type Page } from "@playwright/test";
import { go, login, mixedWorkspace, mockRates, seed } from "./currency-helpers";

// Settings follows a list + detail pattern: side by side on wide screens,
// one view at a time with a back arrow on narrow ones.

const controlWidths = (page: Page) =>
  page
    .locator('[role="radiogroup"], main section .select-wrap')
    .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().width)));

test("wide screens show the list and a category side by side", async ({ page, request }) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  await go(page, "Settings");
  await expect(page.getByRole("region", { name: "Account" })).toBeVisible();
  await go(page, "Preferences");
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  await expect(page.getByRole("button", { name: "Preferences", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to settings" })).toBeHidden();
  expect(new Set(await controlWidths(page)).size).toBe(1);
  await go(page, "Currency");
  await expect(page.getByRole("radiogroup", { name: "Display currency" })).toBeVisible();
  expect(new Set(await controlWidths(page)).size).toBe(1);
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Display currency" })).toBeVisible();
});

test("phones open one category at a time and back returns to the list", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await go(page, "Settings");
  const list = page.getByRole("button", { name: "Preferences", exact: true });
  await expect(list).toBeVisible();
  await expect(page.getByRole("region", { name: "Account" })).toBeHidden();
  await list.click();
  await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  await expect(list).toBeHidden();

  await page.getByRole("button", { name: "Back to settings" }).click();
  await expect(list).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);

  await list.click();
  await page.goBack();
  await expect(list).toBeVisible();

  // A direct link has nothing behind it, yet the arrow still reaches the list.
  await page.goto("/settings/currency");
  await expect(page.getByRole("radiogroup", { name: "Display currency" })).toBeVisible();
  await page.getByRole("button", { name: "Back to settings" }).click();
  await expect(list).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
});
