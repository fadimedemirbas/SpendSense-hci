import { expect, test } from "@playwright/test";
import {
  FRESH_DATE,
  STALE_DATE,
  fitsAndIsAccessible,
  go,
  login,
  mixedWorkspace,
  mockRates,
  seed,
} from "./currency-helpers";

for (const lang of ["en", "tr"] as const) {
  test(`rate details are disclosed accessibly and localized in ${lang}`, async ({
    page,
    request,
  }) => {
    await seed(request, mixedWorkspace());
    await mockRates(page, "fresh");
    await page.setViewportSize({ width: 320, height: 640 });
    await login(page, lang);
    const label = lang === "tr" ? "Döviz kuru bilgisi" : "Exchange rate information";
    const trigger = page
      .getByRole("button", {
        name: lang === "tr" ? `${label} hakkında bilgi` : `Info about ${label}`,
      })
      .first();
    const dialog = page.getByRole("dialog", { name: label });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(dialog).not.toBeVisible();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(dialog).toContainText(
      new Date(`${FRESH_DATE}T00:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    );
    await expect(dialog).toContainText(lang === "tr" ? "Kurlar güncel." : "Rates are up to date.");
    await expect(dialog).toContainText(
      lang === "tr" ? "Uygulamanın son başarılı veri alımı" : "Last received by this app",
    );
    await expect(dialog).toContainText("1 USD = 40 TRY");
    await expect(dialog).toContainText("1 EUR = 45 TRY");
    await expect(dialog).toContainText(
      lang === "tr" ? "(alış + satış) / 2" : "(buying + selling) / 2",
    );
    await expect(dialog).toContainText(lang === "tr" ? "sıfırdan uzağa" : "away from zero");
    // No source-fetch timestamp is invented when the API did not supply it.
    await expect(dialog).not.toContainText(
      lang === "tr" ? "SpendSense'in kaynaktan" : "Source last fetched",
    );
    const rect = await dialog.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(640);
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: lang === "tr" ? "Kapat" : "Close", exact: true }),
    ).toBeFocused();
    await fitsAndIsAccessible(page);
    await page.screenshot({ path: test.info().outputPath(`rates-${lang}-mobile.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    for (const name of lang === "tr"
      ? ["Para", "Hedefler", "İçgörüler", "Ayarlar"]
      : ["Money", "Goals", "Insights", "Settings"]) {
      await go(page, name);
      await expect(trigger).toBeVisible();
      await trigger.click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
}

test("stale rates remain visibly flagged while their date stays in the popover", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "stale");
  await login(page);
  await expect(page.getByText("₺43.850", { exact: true })).toBeVisible();
  await expect(page.getByText("These rates may be out of date.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Info about Exchange rate information" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Exchange rate information" });
  await expect(dialog).toContainText(
    new Date(`${STALE_DATE}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  );
  await expect(dialog).toContainText("These rates may be out of date.");
});

test("unavailable rates expose no invented rate or timestamp and retain visible warnings", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "missing");
  await login(page);
  await expect(page.getByText(/what's left this month can't be calculated/)).toBeVisible();
  await expect(page.getByText("₺43.850", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Info about Exchange rate information" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Exchange rate information" });
  await expect(dialog).toContainText("No validated rate data is available.");
  await expect(dialog).toContainText("Exchange rates are unavailable.");
  await expect(dialog).not.toContainText("1 USD =");
  await expect(dialog).not.toContainText("Last received by this app");
  await expect(dialog).not.toContainText("Bulletin publication date");
});

test("touch opens the disclosure and outside tap closes it", async ({ browser, request }) => {
  await seed(request, mixedWorkspace());
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await mockRates(page, "fresh");
  await login(page);
  await page.getByRole("button", { name: "Info about Exchange rate information" }).first().tap();
  await expect(page.getByRole("dialog", { name: "Exchange rate information" })).toBeVisible();
  await page.touchscreen.tap(4, 4);
  await expect(page.getByRole("dialog", { name: "Exchange rate information" })).not.toBeVisible();
  await context.close();
});

test("bulletin date, upstream fetch and browser receipt remain distinct", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  const receivedAt = `${FRESH_DATE}T12:30:00.000Z`;
  const fetchedAt = `${FRESH_DATE}T11:15:00.000Z`;
  await page.clock.setFixedTime(new Date(receivedAt));
  await page.route("**/api/rates", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        snapshot: {
          source: "TCMB",
          bulletin: "2026/200",
          date: FRESH_DATE,
          fetchedAt,
          rates: {
            USD: { buying: "39.9000", selling: "40.1000" },
            EUR: { buying: "44.9000", selling: "45.1000" },
          },
        },
      }),
    }),
  );
  await login(page);
  await page.getByRole("button", { name: "Info about Exchange rate information" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Exchange rate information" });
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "long",
      timeStyle: "long",
      timeZone: "Europe/Istanbul",
    }).format(new Date(value));
  await expect(
    dialog.locator("dl > div").filter({ hasText: "Last received by this app" }),
  ).toContainText(format(receivedAt));
  await expect(
    dialog.locator("dl > div").filter({ hasText: "Source last fetched by SpendSense" }),
  ).toContainText(format(fetchedAt));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: test.info().outputPath("rates-desktop.png") });
});
