import { expect, test } from "@playwright/test";
import {
  fitsAndIsAccessible,
  go,
  login,
  mixedWorkspace,
  mockRates,
  seed,
  watch,
} from "./currency-helpers";

// Entries in the categories picked in Settings ask before they are deleted.

test("chosen categories ask before deleting; others delete right away", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 390, height: 844 });
  const { saves } = watch(page);
  await login(page);

  // Settings: nothing chosen yet, then add Food (expense) and Salary (income).
  await go(page, "Settings");
  const section = page.getByRole("region", { name: "Delete confirmation" });
  await expect(section.getByText("No categories yet.", { exact: false })).toBeVisible();
  const pick = section.getByRole("combobox", { name: "Category" });
  for (const value of ["expense:Food", "income:Salary", "expense:Transport"]) {
    await pick.selectOption(value);
    await section.getByRole("button", { name: "Add", exact: true }).click();
  }
  const chosen = section.getByRole("list", { name: "Ask before deleting" });
  await expect(chosen.getByRole("listitem")).toHaveText([
    "Food (Expense)",
    "Salary (Income)",
    "Transport (Expense)",
  ]);
  // Chosen categories leave the picker; removing one puts it back.
  await expect(pick.locator('option[value="expense:Food"]')).toHaveCount(0);
  await section.getByRole("button", { name: "Remove Transport (Expense)" }).click();
  await expect(chosen.getByRole("listitem")).toHaveCount(2);
  await expect(pick.locator('option[value="expense:Transport"]')).toHaveCount(1);
  await fitsAndIsAccessible(page);

  // Money: Food asks first. Cancel keeps it; Delete removes it.
  await go(page, "Money");
  await page.getByRole("button", { name: "Delete Market", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this entry?" });
  await expect(dialog).toContainText("Market is in Food");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(saves.length).toBe(0);
  await page.getByRole("button", { name: "Delete Market", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].entries.some((e) => e.id === "food")).toBe(false);
  await expect(page.getByText("Entry deleted.")).toBeVisible();

  // Transport was removed from the list: it deletes without a dialog.
  await page.getByRole("button", { name: "Delete Train", exact: true }).click();
  await expect.poll(() => saves.length).toBe(2);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  // The choice is kept on this device after a reload.
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  await go(page, "Money");
  await page.getByRole("button", { name: "Delete Pay", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete this entry?" })).toBeVisible();
});

test("the setting and dialog are translated", async ({ page, request }) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.addInitScript(() =>
    localStorage.setItem("ss.confirmDelete", JSON.stringify(["expense:Food"])),
  );
  await page.setViewportSize({ width: 320, height: 700 });
  await login(page, "tr");
  await go(page, "Ayarlar");
  const section = page.getByRole("region", { name: "Silme onayı" });
  await expect(section.getByRole("listitem")).toHaveText(["Yemek (Gider)"]);
  await fitsAndIsAccessible(page);
  await go(page, "Para");
  await page.getByRole("button", { name: "Sil Market", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Bu kayıt silinsin mi?" })).toBeVisible();
});
