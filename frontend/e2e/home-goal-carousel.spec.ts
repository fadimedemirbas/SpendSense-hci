import { expect, test } from "@playwright/test";
import { fitsAndIsAccessible, login, mixedWorkspace, mockRates, seed } from "./currency-helpers";

test("active goals rotate together every ten seconds and loop with a downward wheel animation", async ({
  page,
  request,
}) => {
  const workspace = mixedWorkspace();
  await seed(request, {
    ...workspace,
    goals: [
      ...workspace.goals,
      { ...workspace.goals[0], id: "archived", name: "Archived goal", status: "Archived" },
      { ...workspace.goals[0], id: "complete", name: "Completed goal", status: "Completed" },
    ],
  });
  await mockRates(page, "fresh");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await login(page);
  const carousel = page.getByRole("region", { name: "Goals", exact: true });
  await expect(carousel.getByRole("heading", { name: "Bike", exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(10_000);
  await expect(carousel.getByRole("heading", { name: "Rome", exact: true })).toBeVisible();
  await expect(carousel.getByRole("img", { name: "Rome 25%" })).toBeVisible();
  await expect(carousel.getByRole("heading", { name: "Bike", exact: true })).toHaveCount(0);
  await expect(carousel.locator(".goal-wheel-in")).toHaveCSS("animation-name", "goal-wheel-in");
  await expect(carousel.locator(".goal-wheel-out")).toHaveCount(0);
  await page.clock.fastForward(10_000);
  await expect(carousel.getByRole("heading", { name: "Bike", exact: true })).toBeVisible();
  await expect(carousel.locator(".goal-wheel-out")).toHaveCount(0);
  await expect(carousel.getByText("Archived goal")).toHaveCount(0);
  await expect(carousel.getByText("Completed goal")).toHaveCount(0);
});

test("hover, info focus and the pause control hold the current goal; reduced motion skips the spin", async ({
  page,
  request,
}) => {
  await seed(request, mixedWorkspace());
  await mockRates(page, "fresh");
  await page.clock.install();
  await login(page);
  const carousel = page.getByRole("region", { name: "Goals", exact: true });
  const bike = carousel.getByRole("heading", { name: "Bike", exact: true });
  await carousel.hover();
  await page.clock.fastForward(20_000);
  await expect(bike).toBeVisible();
  await page.mouse.move(0, 0);
  await carousel.getByRole("button", { name: "Info about Bike" }).focus();
  await page.keyboard.press("Enter");
  await expect(carousel.getByRole("tooltip")).toBeVisible();
  await expect(carousel.locator(".goal-wheel")).toHaveCSS("overflow", "visible");
  await page.clock.fastForward(20_000);
  await expect(bike).toBeVisible();
  await carousel.getByRole("button", { name: "Pause goal rotation" }).focus();
  await carousel.getByRole("button", { name: "Pause goal rotation" }).click();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(20_000);
  await expect(bike).toBeVisible();
  await carousel.getByRole("button", { name: "Resume goal rotation" }).click();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(10_000);
  await expect(carousel.getByRole("heading", { name: "Rome", exact: true })).toBeVisible();
  await expect(carousel.locator(".goal-wheel-out")).toHaveCount(0);
  await expect(carousel.locator(".goal-wheel-slide")).toHaveCSS("animation-name", "none");
  await page.setViewportSize({ width: 320, height: 900 });
  await fitsAndIsAccessible(page);
});

test("one active goal stays still and an empty list has no carousel", async ({ page, request }) => {
  const workspace = mixedWorkspace();
  await seed(request, { ...workspace, goals: workspace.goals.slice(0, 1) });
  await mockRates(page, "fresh");
  await page.clock.install();
  await login(page);
  const carousel = page.getByRole("region", { name: "Goals", exact: true });
  await page.clock.fastForward(30_000);
  await expect(carousel.getByRole("heading", { name: "Bike", exact: true })).toBeVisible();
  await expect(carousel.getByRole("button", { name: "Pause goal rotation" })).toHaveCount(0);
  await seed(request, { ...workspace, goals: [] });
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  await expect(carousel).toHaveCount(0);
});

test("keyboard and dragging change goals while temporary side dots replace the control row", async ({
  page,
  request,
}) => {
  const workspace = mixedWorkspace();
  await seed(request, {
    ...workspace,
    goals: [...workspace.goals, { ...workspace.goals[0], id: "laptop", name: "Laptop" }],
  });
  await mockRates(page, "fresh");
  await page.clock.install();
  await login(page);
  const carousel = page.getByRole("region", { name: "Goals", exact: true });
  const dots = carousel.locator(".goal-wheel-dots");
  await expect(carousel.locator(".goal-wheel-controls")).toHaveCount(0);
  await expect(carousel.getByText("Swipe to change", { exact: true })).toHaveCount(0);
  await expect(dots.locator("span")).toHaveCount(3);
  await expect(dots).toHaveCSS("opacity", "0");
  await carousel.focus();
  await page.keyboard.press("ArrowUp");
  await expect(carousel.getByRole("heading", { name: "Laptop", exact: true })).toBeVisible();
  await expect(dots).toHaveAttribute("data-visible", "true");
  await expect(dots.locator("span").nth(2)).toHaveAttribute("data-active", "true");
  await page.keyboard.press("ArrowDown");
  await expect(carousel.getByRole("heading", { name: "Bike", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(carousel.getByRole("heading", { name: "Rome", exact: true })).toBeVisible();
  const wheel = carousel.locator(".goal-wheel");
  await wheel.scrollIntoViewIfNeeded();
  const box = (await wheel.boundingBox())!;
  const x = box.x + 35;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y - 25);
  await page.mouse.down();
  await page.mouse.move(x, y + 25, { steps: 5 });
  await page.mouse.up();
  await expect(carousel.getByRole("heading", { name: "Laptop", exact: true })).toBeVisible();
  await page.mouse.move(x, y + 25);
  await page.mouse.down();
  await page.mouse.move(x, y - 25, { steps: 5 });
  await page.mouse.up();
  await expect(carousel.getByRole("heading", { name: "Rome", exact: true })).toBeVisible();
  await expect(dots.locator("span").nth(1)).toHaveAttribute("data-active", "true");
  await page.clock.fastForward(1500);
  await expect(dots).toHaveCSS("opacity", "0");
  await page.mouse.move(0, 0);
  await page.clock.fastForward(10_000);
  await expect(carousel.getByRole("heading", { name: "Laptop", exact: true })).toBeVisible();
});

test("touch users can swipe vertically without activating the info button", async ({
  browser,
  request,
}) => {
  await seed(request, mixedWorkspace());
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await mockRates(page, "fresh");
    await page.goto("http://127.0.0.1:4179");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill("pwa-test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("test-only-password");
    await page.getByRole("button", { name: "Log in", exact: true }).last().click();
    const carousel = page.getByRole("region", { name: "Goals", exact: true });
    const wheel = carousel.locator(".goal-wheel");
    await wheel.scrollIntoViewIfNeeded();
    const box = (await wheel.boundingBox())!;
    const x = box.x + 35;
    const y = box.y + box.height / 2;
    const touch = await context.newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: y - 30 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + 30 }],
    });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(carousel.getByRole("heading", { name: "Rome", exact: true })).toBeVisible();
    await expect(carousel.getByRole("tooltip")).toHaveCount(0);
    await expect(carousel.locator(".goal-wheel-dots")).toHaveAttribute("data-visible", "true");
    await expect(carousel.locator(".goal-wheel-dots span")).toHaveCount(2);
    await expect(carousel.locator(".goal-wheel-dots span").nth(1)).toHaveAttribute(
      "data-active",
      "true",
    );
    await fitsAndIsAccessible(page);
  } finally {
    await context.close();
  }
});
