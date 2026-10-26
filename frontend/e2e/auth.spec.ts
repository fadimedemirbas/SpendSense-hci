import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Register/Login HCI improvements, run against the disposable mock backend in
// scripts/pwa-test-server.mjs (it records auth requests; no real e-mails are sent).
const API = "http://127.0.0.1:4180";
type AuthRequest = { method: string; url: string; body: Record<string, unknown> | null };
const authRequests = async (request: APIRequestContext) =>
  (await (await request.get(`${API}/__test/auth-requests`)).json()) as AuthRequest[];
const seed = (request: APIRequestContext) =>
  request.post(`${API}/__test/seed`, {
    data: {
      profile: {
        email: "pwa-test@example.com",
        income: 1,
        savings: 1,
        habits: [0, 1, 2, 0],
        onboarded: true,
        currency: "symbol",
      },
      entries: [],
      goals: [],
      analyses: [],
      decisions: [],
      waiting: [],
    },
  });
const token = () => {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: "3ad85db6-c1fb-4ad5-8f29-87cd481c9754", role: "authenticated", iat: now, exp: now + 3600 })}.test-only-signature`;
};
const recoveryUrl = () =>
  `/?recovery=1#access_token=${token()}&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery`;
// Holds the sign-up response long enough to observe the loading state.
const slowSignup = (page: Page) =>
  page.route(`${API}/auth/v1/signup**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
const describedBy = async (page: Page, label: string) =>
  (await page.getByLabel(label, { exact: true }).getAttribute("aria-describedby")) ?? "";

test.beforeEach(async ({ request }) => {
  await seed(request);
  await authRequests(request); // clear
});

test("registration shows the password rule, links errors to fields and confirms by e-mail", async ({
  page,
  request,
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "Get started", exact: true }).first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Requirement is visible before submitting and announced with the field.
  const rule = page.locator("#password-rule");
  await expect(rule).toContainText("At least 8 characters");
  await expect(rule).toContainText("Requirement not met yet");
  expect(await describedBy(page, "Password")).toContain("password-rule");

  // Invalid e-mail: error is linked to the e-mail field, which receives focus.
  await page.getByLabel("Email", { exact: true }).fill("new@example");
  await page.getByRole("button", { name: "Create your account", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(/email looks incomplete/);
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  expect(await describedBy(page, "Email")).toContain("onboarding-error");

  // Short password: the password field is marked invalid instead.
  await page.getByLabel("Email", { exact: true }).fill("new@example.com");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Use at least 8 characters for a new password.");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Email", { exact: true })).not.toHaveAttribute("aria-invalid");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  expect(await describedBy(page, "Password")).toContain("onboarding-error");

  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await expect(rule).toContainText("Requirement met");
  await expect(page.getByRole("alert")).toHaveCount(0); // stale error cleared while fixing it
  await page.getByRole("button", { name: "Show password" }).press("Space");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");

  await slowSignup(page);
  await page.getByRole("button", { name: "Create your account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Creating account..." })).toBeVisible();
  await expect(page.getByText("Signing in...")).toHaveCount(0);

  // Confirmation state.
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeFocused();
  await expect(page.getByText("new@example.com", { exact: false })).toBeVisible();
  await expect(page.getByText(/spam or junk folder/)).toBeVisible();
  const resend = page.getByRole("button", { name: "Resend email" });
  await expect(resend).toBeDisabled();
  await expect(page.getByText(/You can resend in \d+ s\./)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await authRequests(request)).filter((r) => r.url.includes("/resend"))).toEqual([]);

  // Resend after the cooldown, then the cooldown starts again.
  await page.clock.fastForward(61_000);
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.getByRole("status").filter({ hasText: "new link is on its way" })).toBeVisible();
  await expect(resend).toBeDisabled();
  const sent = (await authRequests(request)).filter((r) => r.url.includes("/auth/v1/resend"));
  expect(sent).toHaveLength(1);
  expect(sent[0].body).toMatchObject({ type: "signup", email: "new@example.com" });

  // Clear way back to Login, with the e-mail kept.
  await page.getByRole("button", { name: "Go to log in" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("new@example.com");
  await expect(page.locator("#password-rule")).toHaveCount(0);
});

test("Turkish registration and login texts", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ss.lang", '"tr"'));
  await page.goto("/");
  await page.getByRole("button", { name: "Başlayalım", exact: true }).first().click();
  await page.getByRole("button", { name: "İleri", exact: true }).click();
  await expect(page.locator("#password-rule")).toContainText("En az 8 karakter");
  await page.getByLabel("E-posta", { exact: true }).fill("yeni@example.com");
  await page.getByLabel("Şifre", { exact: true }).fill("test-only-password");
  await slowSignup(page);
  await page.getByRole("button", { name: "Hesabını oluştur", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Hesap oluşturuluyor..." })).toBeVisible();
  await expect(page.getByText("Giriş yapılıyor...")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "E-postanı kontrol et" })).toBeVisible();
  await expect(page.getByText(/Spam veya gereksiz klasörünü/)).toBeVisible();
  await expect(page.getByRole("button", { name: "E-postayı tekrar gönder" })).toBeDisabled();
  await page.getByRole("button", { name: "Girişe git" }).click();
  await page.getByRole("button", { name: "Şifremi unuttum" }).click();
  await expect(page.getByRole("heading", { name: "Şifreni sıfırla" })).toBeVisible();
});

test("forgot password works by keyboard and never reveals whether an account exists", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("pwa-test@example.com");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeFocused();
  const email = page.getByLabel("Email", { exact: true });
  await expect(email).toHaveValue("pwa-test@example.com");

  await email.fill("nope");
  await email.press("Enter");
  await expect(page.getByRole("alert")).toHaveText(/email looks incomplete/);
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toBeFocused();

  await email.fill("pwa-test@example.com");
  await email.press("Enter");
  const status = page.getByRole("status").filter({ hasText: "If an account exists" });
  await expect(status).toBeVisible();
  await expect(email).not.toHaveAttribute("aria-invalid");
  expect(await email.getAttribute("aria-describedby")).toContain(
    (await status.getAttribute("id")) ?? "missing",
  );
  await expect(page.getByRole("button", { name: "Send again" })).toBeDisabled();
  const reset = (await authRequests(request)).filter((r) => r.url.includes("/auth/v1/recover"));
  expect(reset).toHaveLength(1);
  expect(reset[0].body).toMatchObject({ email: "pwa-test@example.com" });
  expect(decodeURIComponent(reset[0].url)).toMatch(/redirect_to=http:\/\/127\.0\.0\.1:4179\/\?recovery=1/);

  // Same answer for an address with no account.
  await page.getByRole("button", { name: "Back to log in" }).click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email", { exact: true }).fill("unknown-person@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "If an account exists" })).toBeVisible();

  await page.getByRole("button", { name: "Back to log in" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("a recovery link opens the reset screen, validates and updates the password", async ({
  page,
  request,
}) => {
  await page.goto(recoveryUrl());
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(0); // workspace stays closed until done
  const first = page.getByLabel("New password", { exact: true });
  const second = page.getByLabel("Repeat new password", { exact: true });

  await first.fill("short");
  await first.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Use at least 8 characters for a new password.");
  await expect(first).toHaveAttribute("aria-invalid", "true");
  await expect(first).toBeFocused();

  await first.fill("brand-new-pass");
  await second.fill("different-pass");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert")).toHaveText("The passwords don't match.");
  await expect(second).toHaveAttribute("aria-invalid", "true");
  await expect(second).toBeFocused();

  await second.fill("brand-new-pass");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeFocused();
  const updates = (await authRequests(request)).filter(
    (r) => r.method === "PUT" && r.url.includes("/auth/v1/user"),
  );
  expect(updates).toHaveLength(1);
  expect(updates[0].body).toMatchObject({ password: "brand-new-pass" });

  await page.getByRole("button", { name: "Continue to SpendSense" }).click();
  await expect(page.locator("main")).toBeVisible();
  expect(page.url()).not.toContain("recovery");
});

test("expired, used or invalid links explain the problem and offer a new link", async ({
  page,
}) => {
  // Expired reset link (Supabase redirects back with an error instead of a session).
  await page.goto(
    "/?recovery=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
  );
  await expect(
    page.getByRole("heading", { name: "This reset link no longer works" }),
  ).toBeFocused();
  expect(page.url()).not.toContain("error");
  await page.getByRole("button", { name: "Send a new link" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();

  // A recovery token the server rejects.
  await page.route(`${API}/auth/v1/user`, (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: '{"code":"bad_jwt"}' }),
  );
  await page.goto(recoveryUrl());
  await expect(
    page.getByRole("heading", { name: "This reset link no longer works" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to log in" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  // An expired confirmation link (not a reset) shows a plain message on the start screen.
  await page.goto("about:blank");
  await page.goto("/#error=access_denied&error_code=otp_expired");
  await expect(page.getByRole("alert")).toHaveText(/This email link is invalid or has expired/);
});

test("every new auth state meets automated WCAG AA rules", async ({ page }) => {
  const audit = async (state: string) => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({ state, id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Get started", exact: true }).first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.keyboard.press("Enter");
  await audit("register with errors");
  await page.getByLabel("Email", { exact: true }).fill("new@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await audit("check your email");
  await page.getByRole("button", { name: "Go to log in" }).click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "If an account exists" })).toBeVisible();
  await audit("forgot password sent");
  await page.goto(recoveryUrl());
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await audit("reset password with error");
  await page.goto("about:blank");
  await page.goto("/?recovery=1#error_code=otp_expired");
  await audit("invalid reset link");
});
