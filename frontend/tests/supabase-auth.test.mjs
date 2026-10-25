import assert from "node:assert/strict";
import test from "node:test";
import { authenticateUser } from "../src/lib/auth.ts";

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
