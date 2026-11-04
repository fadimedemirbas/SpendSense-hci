import { expect, test, type Page } from "@playwright/test";
import {
  FRESH_DATE,
  STALE_DATE,
  expectNoRateDetails,
  fitsAndIsAccessible,
  go,
  login,
  mixedWorkspace,
  mockRates,
  seed,
} from "./currency-helpers";

// Rate details live in Settings only: the last successful update next to the
// display currency, and the source, bulletin and formula in one disclosure.

const lastUpdate = (value: string, lang: "en" | "tr" = "en") =>
  new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
    timeZoneName: "short",
  }).format(new Date(value));

const bulletinDay = (date: string, lang: "en" | "tr" = "en") =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const disclosure = (page: Page, lang: "en" | "tr" = "en") => {
  const label = lang === "tr" ? "Döviz kuru bilgisi" : "Exchange rate information";
  return {
    trigger: page.getByRole("button", {
      name: lang === "tr" ? `${label} hakkında bilgi` : `Info about ${label}`,
    }),
    dialog: page.getByRole("dialog", { name: label }),
  };
};

const settingsRow = (page: Page, lang: "en" | "tr" = "en") =>
  page.getByText(lang === "tr" ? "Son kur güncellemesi" : "Last exchange rate update");

for (const lang of ["en", "tr"] as const)
  for (const [device, width, height] of [
    ["mobile", 320, 640],
    ["desktop", 1280, 900],
  ] as const)
    test(`rate details appear only in Settings (${lang}, ${device})`, async ({ page, request }) => {
      await seed(request, mixedWorkspace());
      const receivedAt = `${FRESH_DATE}T09:05:00.000Z`;
      await page.clock.setFixedTime(new Date(receivedAt));
      await mockRates(page, "fresh");
      await page.setViewportSize({ width, height });
      await login(page, lang);
      // Conversion still happens on every financial screen, without rate details.
      await expect(page.getByText("₺43.850", { exact: true })).toBeVisible();
      await expectNoRateDetails(page, lang);
      for (const name of lang === "tr"
        ? ["Para", "Hedefler", "İçgörüler"]
        : ["Money", "Goals", "Insights"]) {
        await go(page, name);
        await expectNoRateDetails(page, lang);
      }
      await go(page, lang === "tr" ? "Ayarlar" : "Settings");
      await go(page, lang === "tr" ? "Para birimi" : "Currency");
      const row = settingsRow(page, lang);
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(lastUpdate(receivedAt, lang));
      await expect(row.locator("time")).toHaveAttribute("datetime", receivedAt);
      const { trigger, dialog } = disclosure(page, lang);
      await expect(trigger).toHaveCount(1);
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(bulletinDay(FRESH_DATE, lang));
      await expect(dialog).toContainText(
        lang === "tr" ? "Kurlar güncel." : "Rates are up to date.",
      );
      await expect(dialog).toContainText("1 USD = 40 TRY");
      await expect(dialog).toContainText("1 EUR = 45 TRY");
      await expect(dialog).toContainText(
        lang === "tr" ? "(alış + satış) / 2" : "(buying + selling) / 2",
      );
      // The receipt time is shown once, in the Settings row, not again in the popover.
      await expect(dialog).not.toContainText(lastUpdate(receivedAt, lang));
      // No source-fetch timestamp is invented when the API did not supply it.
      await expect(dialog).not.toContainText(
        lang === "tr" ? "SpendSense'in kaynaktan" : "Source last fetched",
      );
      const rect = (await dialog.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      await fitsAndIsAccessible(page);
      await page.screenshot({
        path: test.info().outputPath(`settings-rates-${lang}-${device}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    });

test("stale rates stay flagged on screens and in Settings", async ({ page, request }) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "stale");
  await login(page);
  await expect(page.getByText("₺43.850", { exact: true })).toBeVisible();
  await expect(page.getByText("These rates may be out of date.", { exact: true })).toBeVisible();
  await expectNoRateDetails(page);
  await go(page, "Money");
  await expect(page.getByText("These rates may be out of date.", { exact: true })).toBeVisible();
  await go(page, "Settings");
  await go(page, "Currency");
  await expect(settingsRow(page)).toHaveCount(1);
  await expect(page.getByText("These rates may be out of date.", { exact: true })).toBeVisible();
  const { trigger, dialog } = disclosure(page);
  await trigger.click();
  await expect(dialog).toContainText(bulletinDay(STALE_DATE));
  await expect(dialog).toContainText("These rates may be out of date.");
});

test("unavailable rates show no invented update time and keep their warnings", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "missing");
  await login(page);
  await expect(page.getByText(/what's left this month can't be calculated/)).toBeVisible();
  await expect(page.getByText("₺43.850", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" }).first()).toBeVisible();
  await expectNoRateDetails(page);
  await go(page, "Settings");
  await go(page, "Currency");
  await expect(settingsRow(page)).toContainText("No successful update yet.");
  await expect(settingsRow(page).locator("time")).toHaveCount(0);
  await expect(page.getByText("Exchange rates are unavailable.", { exact: true })).toBeVisible();
  const { trigger, dialog } = disclosure(page);
  await trigger.click();
  await expect(dialog).toContainText("No validated rate data is available.");
  await expect(dialog).not.toContainText("1 USD =");
  await expect(dialog).not.toContainText("Bulletin publication date");
});

test("touch opens the Settings disclosure and outside tap closes it", async ({
  browser,
  request,
}) => {
  await seed(request, mixedWorkspace());
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await mockRates(page, "fresh");
  await login(page);
  await go(page, "Settings");
  await go(page, "Currency");
  const { trigger, dialog } = disclosure(page);
  await trigger.tap();
  await expect(dialog).toBeVisible();
  await page.touchscreen.tap(4, 4);
  await expect(dialog).not.toBeVisible();
  await context.close();
});

test("Settings keeps the browser receipt apart from the upstream fetch time", async ({
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
  await go(page, "Settings");
  await go(page, "Currency");
  await expect(settingsRow(page)).toContainText(lastUpdate(receivedAt));
  const { trigger, dialog } = disclosure(page);
  await trigger.click();
  await expect(
    dialog.locator("dl > div").filter({ hasText: "Source last fetched by SpendSense" }),
  ).toContainText(
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "long",
      timeStyle: "long",
      timeZone: "Europe/Istanbul",
    }).format(new Date(fetchedAt)),
  );
});
