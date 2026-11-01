import { expect, test } from "@playwright/test";
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

// Savings without a goal: kept as entered (amount, grams or coins), listed with the
// month's entries, summarised on their own and never counted in what's left.

const withHoldings = () => ({
  ...mixedWorkspace(),
  holdings: [
    {
      id: "8f0c8f5e-1d2a-4c7e-9a33-5b1f2d6c7e01",
      kind: "Salary surplus",
      quantity: 5000,
      unit: "TRY",
      name: "October surplus",
      date: localDay(),
    },
  ],
});

test("savings are added, listed, summarised apart and not counted in what's left", async ({
  page,
  request,
}) => {
  await seed(request, withHoldings());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  const { saves } = watch(page);
  await login(page);
  await go(page, "Money");
  const summary = page.locator("dl").filter({ hasText: "Income" }).first();
  const before = await summary.innerText();
  const saved = page.getByRole("region", { name: "Saved this month" });
  await expect(saved).toContainText("Salary surplus₺5.000");
  await expect(saved).toContainText("Not counted in what's left.");
  await expect(page.getByText("+₺5.000", { exact: true })).toBeVisible();

  // Gold in grams, with an optional purchase price per gram.
  await page.getByRole("button", { name: "Add saving" }).click();
  const sheet = page.getByRole("dialog", { name: "Add saving" });
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Pick what you saved.");
  await sheet.getByRole("button", { name: "Gold" }).click();
  await sheet.getByLabel("Amount (grams)").fill("12,5");
  await sheet.getByLabel("Purchase price per g (optional)").fill("3100");
  await sheet.getByLabel("Note (optional)").fill("Bracelet");
  await fitsAndIsAccessible(page);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].schemaVersion).toBe(4);
  expect(saves[0].holdings).toContainEqual(
    expect.objectContaining({
      kind: "Gold",
      quantity: 12.5,
      unit: "g",
      name: "Bracelet",
      price: 3100,
      priceCurrency: "TRY",
    }),
  );
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText("+12,5 g", { exact: true })).toBeVisible();
  await expect(page.getByText("Bought at ₺3.100 / g")).toBeVisible();
  await expect(saved).toContainText("Gold12,5 g");
  expect(await summary.innerText()).toBe(before); // income, spent and left unchanged

  // Crypto needs a coin symbol and keeps up to 8 decimals.
  await page.getByRole("button", { name: "Add saving" }).click();
  await sheet.getByRole("button", { name: "Crypto" }).click();
  await sheet.getByLabel("Amount (coins)").fill("0,00012345");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Enter the coin's symbol, for example BTC.");
  await sheet.getByLabel("Coin", { exact: true }).fill("btc");
  await expect(sheet.getByLabel("Coin", { exact: true })).toHaveValue("BTC");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1].holdings).toContainEqual(
    expect.objectContaining({ kind: "Crypto", quantity: 0.00012345, unit: "BTC" }),
  );
  await expect(page.getByText("+0,00012345 BTC", { exact: true })).toBeVisible();

  // The Savings filter shows only savings; the kind is the category.
  await page.getByRole("radio", { name: "Savings", exact: true }).click();
  await expect(page.getByText("Market", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Bracelet", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Category" }).selectOption("Crypto");
  await expect(page.getByText("Bracelet", { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Category" }).selectOption("all");

  // Edit keeps the id; delete is undoable.
  await page.getByRole("button", { name: "Edit Bracelet" }).click();
  await expect(page.getByRole("dialog", { name: "Edit saving" })).toBeVisible();
  await page.getByLabel("Amount (grams)").fill("15");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saves.length).toBe(3);
  await expect(page.getByText("+15 g", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete October surplus" }).click();
  await expect.poll(() => saves.length).toBe(4);
  expect(saves[3].deletions.holdings).toEqual(["8f0c8f5e-1d2a-4c7e-9a33-5b1f2d6c7e01"]);
  await expect(page.getByText("Saving deleted.")).toBeVisible();
  await fitsAndIsAccessible(page);
});

test("savings can ask before deleting and are translated", async ({ page, request }) => {
  await seed(request, withHoldings());
  await mockRates(page, "fresh");
  await page.addInitScript(() =>
    localStorage.setItem("ss.confirmDelete", JSON.stringify(["saving:Salary surplus"])),
  );
  await page.setViewportSize({ width: 320, height: 700 });
  await login(page, "tr");
  await go(page, "Para");
  await expect(page.getByRole("region", { name: "Bu ay biriktirdiklerin" })).toContainText(
    "Maaş fazlası₺5.000",
  );
  await page.getByRole("button", { name: "Sil October surplus" }).click();
  await expect(page.getByRole("alertdialog", { name: "Bu birikim silinsin mi?" })).toBeVisible();
  await page.getByRole("button", { name: "Vazgeç" }).click();
  await page.getByRole("button", { name: "Birikim ekle" }).click();
  const sheet = page.getByRole("dialog", { name: "Birikim ekle" });
  await sheet.getByRole("button", { name: "Gümüş" }).click();
  await expect(sheet.getByLabel("Miktar (gram)")).toBeVisible();
  await expect(sheet.getByLabel("1 g alış fiyatı (isteğe bağlı)")).toBeVisible();
  await fitsAndIsAccessible(page);
  await sheet.getByRole("button", { name: "Vazgeç" }).click();
  await go(page, "Ayarlar");
  await expect(page.getByRole("region", { name: "Silme onayı" })).toContainText(
    "Maaş fazlası (Birikim)",
  );
});
