import type { SupabaseClient } from "@supabase/supabase-js";

type AuthClient = Pick<SupabaseClient, "auth">;
export type AuthResult = { error?: string; message?: string; expired?: boolean };

// The only password rule SpendSense enforces; it matches the Supabase project minimum.
export const PASSWORD_MIN_LENGTH = 8;
export const meetsPasswordMinimum = (password: string) => password.length >= PASSWORD_MIN_LENGTH;
// Supabase's default e-mail rate limit allows one message per address per minute.
export const RESEND_COOLDOWN_SECONDS = 60;

const CONNECTION = "Could not reach SpendSense. Check your connection and try again.";
const RATE_LIMIT = "Too many attempts. Please wait a moment and try again.";
const SEND_FAILED = "We couldn't send the email right now. Try again in a few minutes.";
const RESET_EXPIRED = "Your reset link has expired. Request a new one.";
const isRateLimit = (code?: string) =>
  code === "over_email_send_rate_limit" || code === "over_request_rate_limit";

export function authMessage(code?: string) {
  if (code === "invalid_credentials") return "Email or password is incorrect.";
  if (code === "email_not_confirmed") return "Confirm your email before logging in.";
  if (code === "weak_password") return "Choose a stronger password with at least 8 characters.";
  if (isRateLimit(code)) return RATE_LIMIT;
  return "Could not sign in or register. Check your details and try again.";
}

export async function authenticateUser(
  client: AuthClient,
  email: string,
  password: string,
  mode: "register" | "login",
  redirectUrl: string,
  name?: { first: string; last: string },
): Promise<AuthResult> {
  try {
    const response =
      mode === "login"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: redirectUrl,
              // Stored in the auth user's metadata, not in the workspace tables.
              ...(name && {
                data: {
                  first_name: name.first,
                  last_name: name.last,
                  full_name: `${name.first} ${name.last}`,
                },
              }),
            },
          });
    if (response.error) return { error: authMessage(response.error.code) };
    return response.data.session
      ? {}
      : { message: "Check your email to confirm your account, then log in." };
  } catch {
    return { error: CONNECTION };
  }
}

// E-mail requests answer the same way whether or not an account exists, so the
// screens never reveal which addresses are registered. Only rate limits and
// server/network failures (not specific to an address) are reported.
async function sendEmail(
  request: () => Promise<{ error: { code?: string; status?: number } | null }>,
  sent: string,
): Promise<AuthResult> {
  try {
    const { error } = await request();
    if (error && isRateLimit(error.code)) return { error: RATE_LIMIT };
    if (error && (error.status ?? 0) >= 500) return { error: SEND_FAILED };
    return { message: sent };
  } catch {
    return { error: CONNECTION };
  }
}

export const resendConfirmation = (client: AuthClient, email: string, redirectUrl: string) =>
  sendEmail(
    () => client.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectUrl } }),
    "If this address still needs confirmation, a new link is on its way.",
  );

// The marker survives Supabase's redirect, so an expired link can still be
// recognised as a password-reset attempt (Supabase drops type=recovery on errors).
export const passwordResetRedirect = (origin: string) => `${origin}/?recovery=1`;

export const requestPasswordReset = (client: AuthClient, email: string, redirectUrl: string) =>
  sendEmail(
    () => client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl }),
    "If an account exists for this email, a reset link is on its way.",
  );

const SESSION_CODES = ["session_not_found", "session_expired", "bad_jwt", "no_authorization"];
export async function updatePassword(client: AuthClient, password: string): Promise<AuthResult> {
  if (!meetsPasswordMinimum(password))
    return { error: "Use at least 8 characters for a new password." };
  try {
    const { error } = await client.auth.updateUser({ password });
    if (!error) return {};
    if (error.code === "same_password")
      return { error: "Choose a new password that's different from your current one." };
    if (error.code === "weak_password") return { error: authMessage(error.code) };
    if (
      error.name === "AuthSessionMissingError" ||
      SESSION_CODES.includes(error.code ?? "") ||
      error.status === 401 ||
      error.status === 403
    )
      return { error: RESET_EXPIRED, expired: true };
    if (isRateLimit(error.code)) return { error: RATE_LIMIT };
    return { error: "Your password could not be changed. Request a new reset link and try again." };
  } catch {
    return { error: CONNECTION };
  }
}

export type AuthRedirect =
  | { kind: "none" }
  | { kind: "recovery" }
  | { kind: "link-error"; recovery: boolean };

// Reads an auth e-mail callback (query or fragment, implicit or PKCE flow).
export function readAuthRedirect(href: string): AuthRedirect {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const get = (key: string) => hash.get(key) ?? url.searchParams.get(key);
  const recovery = url.searchParams.get("recovery") === "1" || get("type") === "recovery";
  if (get("error") || get("error_code") || get("error_description"))
    return { kind: "link-error", recovery };
  if (recovery && (get("access_token") || get("code"))) return { kind: "recovery" };
  return { kind: "none" };
}
