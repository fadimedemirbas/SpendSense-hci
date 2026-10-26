import { createClient } from "@supabase/supabase-js";
import { validateSupabaseConfiguration } from "./supabaseConfiguration";
import { readAuthRedirect, type AuthRedirect } from "./auth";

// Read before the client starts: Supabase consumes recovery tokens from the URL
// and may emit PASSWORD_RECOVERY before React subscribes to auth events.
export const initialAuthRedirect: AuthRedirect =
  typeof window === "undefined" ? { kind: "none" } : readAuthRedirect(window.location.href);

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigurationError = validateSupabaseConfiguration(url, publishableKey);

export const supabase = supabaseConfigurationError
  ? null
  : createClient(url!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

export function requireSupabase() {
  if (!supabase) throw new Error(supabaseConfigurationError!);
  return supabase;
}
