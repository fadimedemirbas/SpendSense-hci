import type { SupabaseClient } from "@supabase/supabase-js";

export function authMessage(code?: string) {
  if (code === "invalid_credentials") return "Email or password is incorrect.";
  if (code === "email_not_confirmed") return "Confirm your email before logging in.";
  if (code === "weak_password") return "Choose a stronger password with at least 8 characters.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit")
    return "Too many attempts. Please wait a moment and try again.";
  return "Could not sign in or register. Check your details and try again.";
}

export async function authenticateUser(
  client: SupabaseClient,
  email: string,
  password: string,
  mode: "register" | "login",
  redirectUrl: string,
): Promise<{ error?: string; message?: string }> {
  try {
    const response =
      mode === "login"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl } });
    if (response.error) return { error: authMessage(response.error.code) };
    return response.data.session
      ? {}
      : { message: "Check your email to confirm your account, then log in." };
  } catch {
    return { error: "Could not reach SpendSense. Check your connection and try again." };
  }
}
