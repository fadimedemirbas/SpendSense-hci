import { expect, test } from "@playwright/test";

test("official logo, favicon and install icons load without changing layout", async ({ page }) => {
  await page.goto("/");
  const logo = page.locator('img[src="/icons/spendsense-mark.png"]').first();
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((node: HTMLImageElement) => ({
    loaded: node.complete && node.naturalWidth === 256,
    square: node.width === node.height,
  }))).toEqual({ loaded: true, square: true });

  const icons = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
    const manifest = await (await fetch(link.href)).json();
    const paths = [
      ...manifest.icons.map((icon: { src: string; sizes: string }) => ({
        src: icon.src, sizes: icon.sizes,
      })),
      ...Array.from(document.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"], link[rel="apple-touch-icon"]',
      )).map((icon) => ({ src: icon.href, sizes: icon.sizes.value })),
      { src: "/favicon.svg", sizes: "512x512" },
      { src: "/icon.svg", sizes: "512x512" },
    ];
    return Promise.all(paths.map(async (icon) => {
      const image = new Image();
      image.src = icon.src;
      await image.decode();
      return { expected: icon.sizes, actual: `${image.naturalWidth}x${image.naturalHeight}` };
    }));
  });
  for (const icon of icons) expect(icon.actual).toBe(icon.expected);
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect(logo).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`logo-${width}.png`) });
  }
});
