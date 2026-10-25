import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

async function controlled(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

test("manifest, PNG icons and cached app shell work offline without caching APIs", async ({
  page,
  context,
}) => {
  await controlled(page);
  const manifest = await page.evaluate(
    async () => await (await fetch("/manifest.webmanifest")).json(),
  );
  expect(manifest).toMatchObject({
    name: "SpendSense",
    short_name: "SpendSense",
    description: "Smart personal finance and spending decision assistant",
    display: "standalone",
    scope: "/",
    start_url: "/",
  });
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, icon.src);
    expect(size.join("x")).toBe(icon.sizes);
  }
  await page.evaluate(async () => {
    await fetch("http://127.0.0.1:4180/rest/v1/entries");
    await fetch("/rest/v1/rpc/private", { method: "POST", body: "private" }).catch(() => {});
  });
  const cached = await page.evaluate(async () => {
    const requests = await Promise.all(
      (await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map((request) => request.url),
      ),
    );
    return requests.flat();
  });
  expect(cached.some((url) => /auth\/v1|rest\/v1|rpc|private-api/.test(url))).toBe(false);
  expect(cached.some((url) => url.includes("index.html"))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect and reload" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).not.toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "Connection restored" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).not.toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reconnect and reload" }).click();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
});

test("offline status is Turkish, responsive, and keyboard reachable", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("ss.lang", '"tr"'));
  await controlled(page);
  await context.setOffline(true);
  await expect(page.getByRole("heading", { name: "Çevrimdışısınız" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.setOffline(false);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Bağlan ve yeniden yükle" })).toBeFocused();
});

test("installation is user-initiated and dismissing the native prompt prevents repeats", async ({
  page,
}) => {
  await controlled(page);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  await expect(page.getByRole("button", { name: "How to install", exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => Number(localStorage.getItem("ss.pwaDismissedUntil")) > Date.now()),
  ).toBe(true);
  await page.getByRole("button", { name: "How to install", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Install SpendSense" })).toBeVisible();
  await page.getByRole("radio", { name: "iPhone & iPad" }).click();
  await expect(page.getByText("Open SpendSense in Safari.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("a new worker waits for confirmation and preserves forms in a second tab", async ({
  page,
  context,
}) => {
  await controlled(page);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("unsaved@example.com");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Log in", exact: true }).click();
  await other.getByLabel("Email", { exact: true }).fill("second-tab@example.com");
  // Mutate only this isolated test build, restoring it even after a failure.
  const workerPath = new URL("../.pwa-test-dist/sw.js", import.meta.url);
  const original = await readFile(workerPath, "utf8");
  await writeFile(workerPath, original + "\n// test update revision " + Date.now() + "\n");
  try {
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(page.getByRole("button", { name: "Update", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("unsaved@example.com");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("unsaved@example.com");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
    await expect(other.getByLabel("Email", { exact: true })).toHaveValue("second-tab@example.com");
  } finally {
    await writeFile(workerPath, original);
  }
});

test("login, financial save/reload, offline privacy and logout work with the PWA worker", async ({
  page,
  context,
}) => {
  await controlled(page);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("pwa-test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Log in", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Money", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Money", exact: true }).first().click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Quick add" });
  await sheet.getByRole("button", { name: "1", exact: true }).click();
  await sheet.getByRole("button", { name: "2", exact: true }).click();
  await sheet.getByRole("button", { name: "Food", exact: true }).click();
  await sheet.getByLabel("Note (optional)").fill("PWA private test purchase");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await expect(page.getByText("PWA private test purchase", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Money", exact: true }).first().click();
  await expect(page.getByText("PWA private test purchase", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
  await expect(page.getByText("PWA private test purchase", { exact: true })).not.toBeVisible();
  await context.setOffline(false);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reconnect and reload" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByText("PWA private test purchase", { exact: true })).not.toBeVisible();
  const cachedBodies = await page.evaluate(async () => {
    const bodies = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys()) {
        const url = new URL(request.url);
        if (/auth\/v1|rest\/v1|rpc/.test(url.pathname)) throw new Error("API was cached");
        if (url.pathname.endsWith(".html"))
          bodies.push(await (await (await caches.open(name)).match(request))!.text());
      }
    return bodies.join("");
  });
  expect(cachedBodies).not.toContain("PWA private test purchase");
});
