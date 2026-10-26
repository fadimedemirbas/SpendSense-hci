import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const widths = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const fixture = () => {
  const purchase = {
    name: "Wireless headphones",
    price: 2500,
    cat: "Shopping",
    reasons: ["need"],
    feeling: "Calm",
    own: false,
    wait: "3d",
  };
  const goal = {
    id: crypto.randomUUID(),
    name: "Emergency savings for the family",
    target: 35000,
    saved: 1000,
    status: "Active",
  };
  const analysisId = crypto.randomUUID();
  return {
    profile: {
      email: "pwa-test@example.com",
      income: 1,
      savings: 1,
      habits: [0, 1, 2, 0],
      onboarded: true,
      currency: "symbol",
    },
    entries: [
      {
        id: crypto.randomUUID(),
        type: "expense",
        name: "Weekly groceries and household essentials",
        amount: 1234.5,
        cat: "Food",
        date: new Date().toISOString().slice(0, 10),
      },
    ],
    goals: [goal],
    analyses: [
      {
        id: analysisId,
        purchase,
        result: {
          budget: 17,
          need: 24,
          goalImpact: 4,
          impulse: 3,
          fit: 84,
          income: 22500,
          pctIncome: 11,
          pctGoal: 7,
          delayDays: 21,
          goal,
        },
        goalId: goal.id,
        createdAt: new Date().toISOString(),
      },
    ],
    decisions: [
      {
        ...purchase,
        id: crypto.randomUUID(),
        analysisId,
        decision: "Wait",
        date: new Date().toISOString().slice(0, 10),
        fit: 84,
      },
    ],
    waiting: [
      {
        ...purchase,
        id: crypto.randomUUID(),
        analysisId,
        added: new Date().toISOString().slice(0, 10),
        review: new Date().toISOString().slice(0, 10),
        fit: 84,
      },
    ],
  };
};
async function layout(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
}
async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("pwa-test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Log in", exact: true }).last().click();
  await expect(page.locator("main")).toBeVisible();
}
async function visit(page: Page, name: string, width: number, more = false) {
  if (more) {
    await page.getByRole("button", { name: /^More/ }).filter({ visible: true }).click();
    if (width < 768)
      await page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
    else {
      const item = page.getByRole("menuitem", { name, exact: true });
      await item.click();
    }
  } else
    await page.getByRole("button", { name, exact: true }).filter({ visible: true }).first().click();
  await expect(page.locator("main")).toBeVisible();
  await layout(page);
}

for (const width of widths) {
  test(`critical screens fit ${width}px without horizontal scrolling`, async ({
    page,
    request,
  }) => {
    await request.post("http://127.0.0.1:4180/__test/seed", { data: fixture() });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await layout(page);
    await login(page);
    await layout(page);
    await visit(page, "Money", width);
    await page.getByRole("button", { name: "Add expense", exact: true }).click();
    await layout(page);
    await page.keyboard.press("Escape");
    await visit(page, "Goals", width);
    await page.getByRole("button", { name: "Add goal", exact: true }).click();
    await layout(page);
    await page.keyboard.press("Escape");
    await visit(page, "Insights", width);
    await visit(page, "Waiting List", width, true);
    await visit(page, "History", width, true);
    await visit(page, "Settings", width);
    await page.getByRole("radio", { name: "Türkçe", exact: true }).click();
    await layout(page);
    await visit(page, "Para", width);
    await visit(page, "Hedefler", width);
    await visit(page, "İçgörüler", width);
    await visit(page, "Karar", width); // Full translated analysis flow is tested separately.
  });
}

test("critical screens meet automated WCAG AA rules", async ({ page, request }) => {
  await request.post("http://127.0.0.1:4180/__test/seed", { data: fixture() });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  for (const name of [
    "Home",
    "Money",
    "Goals",
    "Insights",
    "Settings",
    "Decide",
    "Waiting List",
    "History",
  ]) {
    await visit(page, name, 390, ["Waiting List", "History"].includes(name));
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
});

test("a failed workspace chunk has a translated recovery screen instead of a blank app", async ({
  browser,
  request,
}) => {
  await request.post("http://127.0.0.1:4180/__test/seed", { data: fixture() });
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    await context.route("**/SignedIn-*.js", (route) => route.abort());
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4179/");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill("pwa-test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("test-only-password");
    await page.getByRole("button", { name: "Log in", exact: true }).last().click();
    await expect(
      page.getByText("This screen could not load. Reconnect and reload SpendSense."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload my data" })).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const [width, height] of [
  [320, 568],
  [844, 390],
  [1024, 768],
]) {
  test(`purchase, decisions and modal forms remain usable at ${width}x${height}`, async ({
    page,
    request,
  }) => {
    await request.post("http://127.0.0.1:4180/__test/seed", { data: fixture() });
    await page.setViewportSize({ width, height });
    await login(page);
    await visit(page, "Decide", width);
    await page.getByLabel("Product name").fill("A practical purchase");
    await page.getByLabel("Price (₺)", { exact: true }).fill("129.95");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.locator("button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Calm", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "No", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "3 days", exact: true }).click();
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(page.getByRole("heading", { name: "A practical purchase" })).toBeVisible();
    await layout(page);
    await page.getByRole("button", { name: "Wait", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Waiting List", exact: true })).toBeVisible();
    await layout(page);
    await visit(page, "History", width, true);
    await page
      .getByRole("button", { name: "How do you feel about this decision now?", exact: true })
      .first()
      .click();
    await page.getByRole("radio", { name: "5 Very good", exact: true }).first().click();
    await visit(page, "Goals", width);
    await page.getByRole("button", { name: "Add goal", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add goal" });
    await expect(dialog.getByLabel("Goal name")).toBeFocused();
    await dialog.getByLabel("Goal name").fill("Mobile savings");
    await dialog.getByLabel("Target (₺)", { exact: true }).fill("5000");
    await layout(page);
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
    await dialog.getByRole("button", { name: "Save", exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Mobile savings", exact: true })).toHaveCount(1);
    await visit(page, "Settings", width);
    await page.getByRole("button", { name: "Retake spending style questions" }).click();
    await layout(page);
    for (let question = 0; question < 4; question++) {
      await page.locator("section button[aria-pressed]").first().click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await layout(page);
    }
    await expect(page.getByRole("heading", { name: "Your spending style" })).toBeVisible();
  });
}

test("mobile registration, first onboarding and keyboard language controls", async ({
  page,
  request,
}) => {
  const fresh = fixture();
  fresh.profile.onboarded = false;
  fresh.profile.habits = [];
  await request.post("http://127.0.0.1:4180/__test/seed", { data: fresh });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "Get started", exact: true }).first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("new@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Create your account", exact: true }).last().click();
  await expect(
    page.getByText("Check your email to confirm your account, then log in."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("pwa-test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Log in", exact: true }).last().click();
  await expect(page.getByText("Step 1 of 7")).toBeVisible();
  await layout(page);
  await page.getByRole("radio", { name: "EN", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "TR", exact: true })).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  for (let question = 0; question < 4; question++) {
    await page.locator("section button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await layout(page);
  }
  await page.getByRole("button", { name: "Let's go", exact: true }).click();
  await expect(page.locator("main")).toBeVisible();
});
