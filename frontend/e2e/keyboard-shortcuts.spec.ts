import { expect, test, type Page } from "@playwright/test";
import {
  fitsAndIsAccessible,
  go,
  legacyWorkspace,
  login,
  mockRates,
  seed,
  watch,
} from "./currency-helpers";

const focusMain = (page: Page) => page.locator("#main-content").focus();
const enableOnDevice = (page: Page) =>
  page.addInitScript(() => localStorage.setItem("ss.keyboardShortcuts", "true"));

test.beforeEach(async ({ page, request }) => {
  await seed(request, legacyWorkspace());
  await mockRates(page, "fresh");
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("shortcuts are optional, persist on this device and never save records", async ({ page }) => {
  const { saves } = watch(page);
  await login(page);
  await focusMain(page);
  for (const key of ["n", "d", "?"]) await page.keyboard.press(key);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await go(page, "Settings");
  const setting = page.getByRole("radiogroup", { name: "Keyboard shortcuts", exact: true });
  await expect(setting.getByRole("radio", { name: "Off", exact: true })).toBeChecked();
  await setting.getByRole("radio", { name: "On", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("ss.keyboardShortcuts"))).toBe("true");
  await page.reload();
  await expect(setting.getByRole("radio", { name: "On", exact: true })).toBeChecked();

  await go(page, "Home");
  await focusMain(page);
  await page.keyboard.press("n");
  const quick = page.getByRole("dialog", { name: "Quick add", exact: true });
  await expect(quick).toBeVisible();
  await expect(quick.getByRole("radio", { name: "Expense", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(quick).toHaveCount(0);

  await go(page, "Settings");
  await setting.getByRole("radio", { name: "Off", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("ss.keyboardShortcuts"))).toBe("false");
  await go(page, "Home");
  await focusMain(page);
  for (const key of ["n", "d", "?"]) await page.keyboard.press(key);
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(saves).toHaveLength(0);
});

test("typing, modifier keys, composition, repeats and open menus or forms do not trigger shortcuts", async ({
  page,
}) => {
  await enableOnDevice(page);
  const { saves } = watch(page);
  await login(page);
  await focusMain(page);
  await page.evaluate(() => {
    const main = document.getElementById("main-content")!;
    for (const key of ["n", "d", "?"]) {
      for (const guard of ["ctrlKey", "metaKey", "altKey", "repeat", "isComposing"])
        main.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, [guard]: true }));
    }
    main.dispatchEvent(new KeyboardEvent("keydown", { key: "n", keyCode: 229, bubbles: true }));
    const prevented = new KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true });
    prevented.preventDefault();
    main.dispatchEvent(prevented);
    const fieldset = document.querySelector("fieldset")!;
    fieldset.disabled = true;
    for (const key of ["n", "d", "?"])
      main.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    fieldset.disabled = false;
    for (const attribute of ["role", "contenteditable"]) {
      const editor = document.createElement("div");
      editor.setAttribute(attribute, attribute === "role" ? "textbox" : "true");
      editor.tabIndex = 0;
      main.append(editor);
      editor.focus();
      for (const key of ["n", "d", "?"])
        main.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      editor.remove();
    }
  });
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await go(page, "Decide");
  await page.getByLabel("Product name", { exact: true }).pressSequentially("nd?");
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue("nd?");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await go(page, "Home");
  await go(page, "More");
  for (const key of ["n", "d", "?"]) await page.keyboard.press(key);
  await expect(page.getByRole("menu", { name: "More", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await focusMain(page);
  await page.keyboard.press("N");
  const quick = page.getByRole("dialog", { name: "Quick add", exact: true });
  await quick.getByLabel("Amount (₺)", { exact: true }).fill("175.50");
  await quick.getByLabel("Note (optional)", { exact: true }).fill("Unsaved entry");
  await quick.getByRole("button", { name: "Close", exact: true }).focus();
  for (const key of ["n", "d", "?"]) await page.keyboard.press(key);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(quick.getByLabel("Amount (₺)", { exact: true })).toHaveValue("175.50");
  await expect(quick.getByLabel("Note (optional)", { exact: true })).toHaveValue("Unsaved entry");
  await expect(page).toHaveURL(/\/home$/);
  expect(saves).toHaveLength(0);
});

test("open password and goal forms preserve drafts after focus leaves the inputs", async ({
  page,
}) => {
  await enableOnDevice(page);
  await login(page);
  await go(page, "Settings");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  const password = page.getByLabel("New password", { exact: true });
  await password.fill("Unsaved-password");
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  await cancel.focus();
  for (const key of ["d", "n", "?"]) await page.keyboard.press(key);
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(password).toHaveValue("Unsaved-password");
  await cancel.click();
  await focusMain(page);
  await page.keyboard.press("d");
  await expect(page).toHaveURL(/\/decide$/);

  await go(page, "Goals");
  await page.getByRole("button", { name: "Add goal", exact: true }).click();
  const goalName = page.getByLabel("Goal name", { exact: true });
  await goalName.fill("Unsaved goal");
  await page.getByRole("button", { name: "Next", exact: true }).focus();
  for (const key of ["d", "n", "?"]) await page.keyboard.press(key);
  await expect(page).toHaveURL(/\/goals$/);
  await expect(page.getByRole("heading", { name: "Add goal", exact: true })).toBeVisible();
  await expect(goalName).toHaveValue("Unsaved goal");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("D preserves the current purchase and question mark opens dismissible help", async ({
  page,
}) => {
  await enableOnDevice(page);
  await login(page);
  await focusMain(page);
  await page.keyboard.press("d");
  await expect(page).toHaveURL(/\/decide$/);
  await page.getByLabel("Product name", { exact: true }).fill("Desk lamp");
  await page.getByLabel("Price (₺)", { exact: true }).fill("129.50");
  await focusMain(page);
  await page.keyboard.press("d");
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue("Desk lamp");
  await expect(page.getByLabel("Price (₺)", { exact: true })).toHaveValue("129.50");

  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
  await expect(help).toBeVisible();
  await expect(help).toContainText("Add expense");
  await expect(help).toContainText("Go to Decide");
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue("Desk lamp");
});

test("help is discoverable while shortcuts are off, translated and accessible at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await login(page, "tr");
  const more = page.getByRole("button", { name: "Daha fazla", exact: true });
  await more.click();
  await page
    .getByRole("dialog", { name: "Daha fazla", exact: true })
    .getByRole("button", { name: "Klavye kısayolları", exact: true })
    .click();
  const help = page.getByRole("dialog", { name: "Klavye kısayolları", exact: true });
  await expect(help).toBeVisible();
  await expect(help.getByRole("button", { name: "Kapat", exact: true })).toBeFocused();
  const heading = await help
    .getByRole("heading", { name: "Klavye kısayolları", exact: true })
    .boundingBox();
  expect(heading?.y).toBeGreaterThanOrEqual(0);
  expect(heading!.y + heading!.height).toBeLessThanOrEqual(740);
  await expect(help).toContainText("Gider ekle");
  await fitsAndIsAccessible(page);
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(more).toBeFocused();
  await go(page, "Ayarlar");
  await expect(
    page
      .getByRole("radiogroup", { name: "Klavye kısayolları", exact: true })
      .getByRole("radio", { name: "Kapalı", exact: true }),
  ).toBeChecked();
});
