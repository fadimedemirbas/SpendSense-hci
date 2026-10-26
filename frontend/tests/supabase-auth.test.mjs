import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticateUser,
  meetsPasswordMinimum,
  passwordResetRedirect,
  readAuthRedirect,
  requestPasswordReset,
  resendConfirmation,
  updatePassword,
} from "../src/lib/auth.ts";

// Isolated API contract tests; production always calls the real Supabase client.
test("registration uses signUp and reports email confirmation without an authenticated session", async () => {
  let request;
  const client = {
    auth: {
      signUp: async (input) => {
        request = input;
        return { data: { session: null }, error: null };
      },
    },
  };
  const result = await authenticateUser(
    client,
    "test@example.com",
    "test-only-password",
    "register",
    "http://localhost:5173",
  );
  assert.equal(request.options.emailRedirectTo, "http://localhost:5173");
  assert.equal(request.email, "test@example.com");
  assert.match(result.message, /confirm/);
  assert.equal(result.error, undefined);
});
test("login calls signInWithPassword and a valid session needs no fake success message", async () => {
  let request;
  const client = {
    auth: {
      signInWithPassword: async (input) => {
        request = input;
        return { data: { session: { user: { id: "test-user" } } }, error: null };
      },
    },
  };
  assert.deepEqual(
    await authenticateUser(
      client,
      "test@example.com",
      "test-only-password",
      "login",
      "http://localhost",
    ),
    {},
  );
  assert.equal(request.password, "test-only-password");
});
test("auth errors and network failures are plain-language and never expose response details", async () => {
  const client = {
    auth: {
      signInWithPassword: async () => ({
        error: { code: "invalid_credentials", message: "sensitive internal details" },
      }),
    },
  };
  assert.equal(
    (await authenticateUser(client, "test@example.com", "wrong", "login", "http://localhost"))
      .error,
    "Email or password is incorrect.",
  );
  client.auth.signInWithPassword = async () => {
    throw new Error("private transport details");
  };
  const result = await authenticateUser(
    client,
    "test@example.com",
    "wrong",
    "login",
    "http://localhost",
  );
  assert.match(result.error, /connection/);
  assert.doesNotMatch(result.error, /private/);
});

test("the password rule shown before submitting matches the enforced minimum", () => {
  assert.equal(meetsPasswordMinimum("1234567"), false);
  assert.equal(meetsPasswordMinimum("12345678"), true);
});

test("resending confirmation uses Supabase resend for sign-up with the same redirect", async () => {
  let request;
  const client = { auth: { resend: async (input) => ((request = input), { error: null }) } };
  const result = await resendConfirmation(client, "new@example.com", "https://app.example");
  assert.deepEqual(request, {
    type: "signup",
    email: "new@example.com",
    options: { emailRedirectTo: "https://app.example" },
  });
  assert.match(result.message, /If this address still needs confirmation/);
});

test("reset requests never reveal whether an account exists", async () => {
  let request;
  const answer = async (error) =>
    requestPasswordReset(
      {
        auth: {
          resetPasswordForEmail: async (email, options) => ((request = { email, options }), { error }),
        },
      },
      "someone@example.com",
      passwordResetRedirect("https://app.example"),
    );
  const unknown = await answer({ code: "user_not_found", status: 400, message: "User not found" });
  const known = await answer(null);
  assert.deepEqual(unknown, known);
  assert.match(known.message, /If an account exists/);
  assert.equal(request.options.redirectTo, "https://app.example/?recovery=1");
  assert.match((await answer({ code: "over_email_send_rate_limit", status: 429 })).error, /wait/);
  assert.match((await answer({ code: "unexpected_failure", status: 500 })).error, /couldn't send/);
  const offline = await requestPasswordReset(
    { auth: { resetPasswordForEmail: async () => Promise.reject(new Error("private")) } },
    "someone@example.com",
    "https://app.example/?recovery=1",
  );
  assert.match(offline.error, /connection/);
});

test("password updates are validated locally and map expired recovery sessions", async () => {
  let calls = 0;
  const client = (error) => ({ auth: { updateUser: async () => (calls++, { error }) } });
  assert.match((await updatePassword(client(null), "short")).error, /8 characters/);
  assert.equal(calls, 0);
  assert.deepEqual(await updatePassword(client(null), "a-new-password"), {});
  assert.match(
    (await updatePassword(client({ code: "same_password", status: 422 }), "a-new-password")).error,
    /different/,
  );
  const expired = await updatePassword(
    client({ name: "AuthSessionMissingError", status: 400 }),
    "a-new-password",
  );
  assert.equal(expired.expired, true);
  assert.match(expired.error, /expired/);
});

test("auth e-mail callbacks are recognised from the URL", () => {
  assert.deepEqual(readAuthRedirect("https://app.example/"), { kind: "none" });
  assert.deepEqual(readAuthRedirect("https://app.example/#home"), { kind: "none" });
  assert.deepEqual(
    readAuthRedirect(
      "https://app.example/?recovery=1#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=recovery",
    ),
    { kind: "recovery" },
  );
  // Supabase fell back to the Site URL (marker lost): the token type still identifies recovery.
  assert.deepEqual(
    readAuthRedirect("https://app.example/#access_token=a&type=recovery"),
    { kind: "recovery" },
  );
  assert.deepEqual(readAuthRedirect("https://app.example/?recovery=1&code=pkce-code"), {
    kind: "recovery",
  });
  assert.deepEqual(
    readAuthRedirect(
      "https://app.example/?recovery=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    ),
    { kind: "link-error", recovery: true },
  );
  assert.deepEqual(readAuthRedirect("https://app.example/#error_code=otp_expired"), {
    kind: "link-error",
    recovery: false,
  });
  // Opening the bare marker later (no token) is not a recovery attempt.
  assert.deepEqual(readAuthRedirect("https://app.example/?recovery=1"), { kind: "none" });
});
