import { expect, test, type Page } from "@playwright/test";
import {
  fitsAndIsAccessible,
  go,
  goDecide,
  localDay,
  login,
  mixedWorkspace,
  mockRates,
  seed,
  watch,
} from "./currency-helpers";

// Light / Dark / System theme (Settings → Preferences → Theme).

const theme = (page: Page) =>
  page.evaluate(() => ({
    attribute: document.documentElement.dataset.theme,
    stored: (() => {
      try {
        return localStorage.getItem("ss.theme");
      } catch {
        return "blocked";
      }
    })(),
    background: getComputedStyle(document.body).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  }));
const LIGHT_BG = "rgb(255, 246, 236)";
const DARK_BG = "rgb(26, 18, 25)";
const picker = (page: Page, label = "Theme") => page.getByRole("radiogroup", { name: label });

test("icon theme picker appears in the public header and only Settings after login", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const headerPicker = page.locator("header").getByRole("radiogroup", { name: "Theme" });
  await expect(headerPicker).toBeVisible();
  await expect(headerPicker.getByRole("radio")).toHaveCount(2);
  await expect(headerPicker.getByRole("radio", { name: "Light", exact: true })).toBeChecked();
  await expect(headerPicker.getByRole("radio", { name: "Light", exact: true })).toHaveAttribute(
    "tabindex",
    "0",
  );
  for (const name of ["Light", "Dark"]) {
    const option = headerPicker.getByRole("radio", { name, exact: true });
    await expect(option.locator("svg")).toBeVisible();
    await expect(option).toHaveText("");
    await expect(option).toHaveAttribute("title", name);
  }
  await headerPicker.getByRole("radio", { name: "Dark", exact: true }).click();
  expect((await theme(page)).stored).toBe("dark");
  await fitsAndIsAccessible(page);
  await login(page);
  await expect(picker(page)).toHaveCount(0);
  await go(page, "Settings");
  await go(page, "Preferences");
  await expect(picker(page).getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await expect(picker(page).getByRole("radio", { name: "System", exact: true })).toBeVisible();
  await expect(page.locator("header").getByRole("radiogroup", { name: "Theme" })).toHaveCount(0);
});

test("theme changes dissolve gently, survive rapid switches and clean up the glow", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await page.goto("/");
  await expect(picker(page)).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition");
  await picker(page).getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme-transition", "dark");
  const during = await page.evaluate(() => ({
    duration: getComputedStyle(document.body).transitionDuration,
    background: getComputedStyle(document.body).backgroundColor,
    animation: getComputedStyle(document.documentElement, "::after").animationName,
    pointerEvents: getComputedStyle(document.documentElement, "::after").pointerEvents,
  }));
  expect(during.duration).toBe("0.75s");
  expect(during.background).not.toBe(DARK_BG);
  expect(during.animation).toBe("theme-sunset");
  expect(during.pointerEvents).toBe("none");
  await picker(page).getByRole("radio", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme-transition", "light");
  await picker(page).getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition");
  expect(await theme(page)).toMatchObject({
    attribute: "dark",
    background: DARK_BG,
    stored: "dark",
  });
  await picker(page).getByRole("radio", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition");
  expect((await theme(page)).background).toBe(LIGHT_BG);
});

test("inherited text colours stay settled when the theme glow finishes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await page.goto("/");
  await expect(picker(page)).toBeVisible();
  for (const name of ["Dark", "Light"]) {
    const samples = await page.evaluate(async (label) => {
      const button = document.querySelector<HTMLButtonElement>(`[role="radio"][title="${label}"]`)!;
      const text = document.querySelector("header b")!;
      const samples: string[] = [];
      const start = performance.now();
      button.click();
      await new Promise<void>((resolve) => {
        const frame = () => {
          const elapsed = performance.now() - start;
          if (elapsed >= 800) samples.push(getComputedStyle(text).color);
          if (elapsed >= 1150) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      return samples;
    }, name);
    expect(samples.length).toBeGreaterThan(2);
    expect(new Set(samples).size).toBe(1);
  }
});

test("reduced motion switches the public theme immediately without the glow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await picker(page).getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition");
  expect((await theme(page)).background).toBe(DARK_BG);
});

/** A workspace with something on every screen: entries, goals, a waiting item, a decision. */
const fullWorkspace = () => {
  const ws = mixedWorkspace();
  return {
    ...ws,
    waiting: [
      {
        id: "w1",
        name: "Lamp",
        price: 800,
        currency: "TRY",
        cat: "Home",
        reasons: ["need"],
        feeling: "Calm",
        own: false,
        wait: "3d",
        added: localDay(-1),
        review: localDay(2),
        fit: 60,
      },
    ],
    decisions: [
      {
        id: "d1",
        name: "Shoes",
        price: 50,
        currency: "USD",
        cat: "Clothing",
        reasons: ["sale"],
        feeling: "Excited",
        own: false,
        wait: "24h",
        decision: "Buy",
        date: localDay(-3),
        fit: 40,
      },
    ],
  };
};

test("Settings switches Light, Dark and System at once and remembers the choice", async ({
  page,
  request,
}) => {
  await seed(request, fullWorkspace());
  await mockRates(page, "fresh");
  await page.emulateMedia({ colorScheme: "light" });
  const { saves } = watch(page);
  await login(page);
  await go(page, "Settings");
  await go(page, "Preferences");
  const group = picker(page);
  // Default: System, which follows the (light) device.
  await expect(group.getByRole("radio", { name: "System" })).toBeChecked();
  expect(await theme(page)).toMatchObject({
    attribute: "light",
    stored: null,
    background: LIGHT_BG,
  });

  // No reload: a marker on window survives every switch.
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 42));
  await group.getByRole("radio", { name: "Dark" }).click();
  await expect(group.getByRole("radio", { name: "Dark" })).toBeChecked();
  expect(await theme(page)).toEqual({
    attribute: "dark",
    stored: "dark",
    background: DARK_BG,
    scheme: "dark",
    themeColor: "#1a1219",
  });
  await group.getByRole("radio", { name: "Light" }).click();
  expect(await theme(page)).toMatchObject({ attribute: "light", stored: "light", scheme: "light" });
  // Keyboard works like the other settings.
  await group.getByRole("radio", { name: "Light" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Dark" })).toBeChecked();
  expect(await page.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(42);
  expect(saves).toEqual([]); // a device preference: nothing is written to the account

  // Kept after a reload, before and after sign-in.
  await page.reload();
  expect(await theme(page)).toMatchObject({ attribute: "dark", background: DARK_BG });
  await go(page, "Settings");
  await go(page, "Preferences");
  await expect(picker(page).getByRole("radio", { name: "Dark" })).toBeChecked();
  // User data is untouched by theme changes.
  await go(page, "Money");
  await expect(page.getByText("Market", { exact: true })).toBeVisible();
});

test("System follows the device theme live, and an explicit choice overrides it", async ({
  page,
  request,
}) => {
  await seed(request, fullWorkspace());
  await mockRates(page, "fresh");
  await page.emulateMedia({ colorScheme: "dark" });
  await login(page);
  expect((await theme(page)).attribute).toBe("dark");
  // A half-typed purchase stays while the device switches theme.
  await goDecide(page);
  await page.getByLabel("Product name").fill("Headphones");
  await page.getByLabel("Price (₺)", { exact: true }).fill("2500");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(async () => (await theme(page)).attribute).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(async () => (await theme(page)).attribute).toBe("dark");
  await expect(page.getByLabel("Product name")).toHaveValue("Headphones");
  await expect(page.getByLabel("Price (₺)", { exact: true })).toHaveValue("2500");

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button").last().click();
  await go(page, "Settings");
  await go(page, "Preferences");
  await picker(page).getByRole("radio", { name: "Light" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  expect((await theme(page)).attribute).toBe("light");
  await picker(page).getByRole("radio", { name: "System" }).click();
  expect(await theme(page)).toMatchObject({ attribute: "dark", stored: "system" });
});

test("the saved theme is applied before the app runs (no flash) and before sign-in", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("ss.theme", "dark"));
  await page.emulateMedia({ colorScheme: "light" });
  // Block the app bundle: only index.html's inline script can set the theme.
  await page.route("**/*.js", (route) =>
    route.request().resourceType() === "script" ? route.abort() : route.continue(),
  );
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await page.unroute("**/*.js");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  expect(await theme(page)).toMatchObject({ attribute: "dark", background: DARK_BG });
  await fitsAndIsAccessible(page);
});

test("blocked storage: the theme script falls back to the device theme without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  // Only the theme code is checked here: index.html's script with the app bundle blocked,
  // then the theme module itself (src/lib/theme.ts, unit-tested with throwing storage).
  await page.route("**/*.js", (route) =>
    route.request().resourceType() === "script" ? route.abort() : route.continue(),
  );
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(errors).toEqual([]);
});

test("the theme control is translated", async ({ page, request }) => {
  await seed(request, fullWorkspace());
  await mockRates(page, "fresh");
  await login(page, "tr");
  await go(page, "Ayarlar");
  await go(page, "Tercihler");
  const group = picker(page, "Tema");
  for (const name of ["Açık", "Koyu", "Sistem"])
    await expect(group.getByRole("radio", { name })).toBeVisible();
  await expect(
    page.getByText("Sistem, cihazının açık veya koyu tema ayarını izler."),
  ).toBeVisible();
  await group.getByRole("radio", { name: "Koyu" }).click();
  expect((await theme(page)).attribute).toBe("dark");
});

for (const [label, width, height] of [
  ["320px", 320, 640],
  ["desktop", 1280, 900],
] as const) {
  for (const lang of ["en", "tr"] as const)
    test(`Dark mode on every screen is accessible and fits (${label}, ${lang})`, async ({
      page,
      request,
    }) => {
      test.setTimeout(120000);
      const tr = (en: string, trText: string) => (lang === "tr" ? trText : en);
      await seed(request, fullWorkspace());
      await mockRates(page, "fresh");
      await page.addInitScript(() => localStorage.setItem("ss.theme", "dark"));
      await page.setViewportSize({ width, height });
      if (lang === "tr") await page.addInitScript(() => localStorage.setItem("ss.lang", '"tr"'));
      await page.goto("/");
      expect((await theme(page)).background).toBe(DARK_BG);
      await fitsAndIsAccessible(page); // Landing
      await login(page, lang);
      await fitsAndIsAccessible(page); // Home
      const screens = [
        tr("Money", "Para"),
        tr("Goals", "Hedefler"),
        tr("Insights", "İçgörüler"),
        tr("Settings", "Ayarlar"),
      ];
      for (const name of screens) {
        await go(page, name);
        await fitsAndIsAccessible(page);
      }
      for (const name of [tr("Waiting List", "Bekleme Listesi"), tr("History", "Geçmiş")]) {
        // Under "More": a sheet on phones, a menu on desktop.
        await page
          .getByRole("button", { name: new RegExp(`^${tr("More", "Daha fazla")}`) })
          .filter({ visible: true })
          .click();
        await (
          width < 768
            ? page.getByRole("dialog").getByRole("button", { name, exact: true })
            : page.getByRole("menuitem", { name, exact: true })
        ).click();
        await fitsAndIsAccessible(page);
      }
      await goDecide(page);
      await fitsAndIsAccessible(page);
      // Sheets, dialogs and toasts use the dark surfaces too.
      await go(page, tr("Money", "Para"));
      await page
        .getByRole("button", { name: tr("Add expense", "Gider ekle"), exact: true })
        .click();
      await fitsAndIsAccessible(page);
      const sheet = page.getByRole("dialog");
      const panel = await sheet.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(panel).not.toBe("rgb(255, 255, 255)");
      expect(panel).not.toBe("rgb(255, 253, 249)");
    });
}

test("charts and money colours stay readable in Dark mode", async ({ page, request }) => {
  await seed(request, fullWorkspace());
  await mockRates(page, "fresh");
  await page.addInitScript(() => localStorage.setItem("ss.theme", "dark"));
  await login(page);
  await go(page, "Insights");
  // Bar fills stand out from their empty track (non-text contrast ≥ 3:1).
  const ratios = await page.evaluate(() => {
    const rgb = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number);
    const lum = (value: string) => {
      const [r, g, b] = rgb(value).map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    return [...document.querySelectorAll('[role="progressbar"]')].map((track) =>
      ratio(
        getComputedStyle(track.firstElementChild!).backgroundColor,
        getComputedStyle(track).backgroundColor,
      ),
    );
  });
  expect(ratios.length).toBeGreaterThan(3);
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(3);
  await fitsAndIsAccessible(page);
  // Income is not told by colour alone: it keeps its "+" sign.
  await go(page, "Money");
  await expect(page.getByText("+₺30.000", { exact: true })).toBeVisible();
  await expect(page.getByText("−₺1.250", { exact: true })).toBeVisible();
});

test("the offline screen follows the Dark theme", async ({ page, context, request }) => {
  await seed(request, fullWorkspace());
  await mockRates(page, "fresh");
  await page.addInitScript(() => localStorage.setItem("ss.theme", "dark"));
  await login(page);
  await context.setOffline(true);
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
  expect((await theme(page)).background).toBe(DARK_BG);
  await fitsAndIsAccessible(page);
  await context.setOffline(false);
});
