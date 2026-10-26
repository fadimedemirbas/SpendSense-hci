export function validateSupabaseConfiguration(url?: string, key?: string): string | null {
  if (!url || !key)
    return "Add the Supabase Project URL and Publishable Key to .env.local, then restart the app.";
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password)
      throw new Error();
    if (!key.startsWith("sb_publishable_") || key.includes("replace_")) throw new Error();
    return null;
  } catch {
    return "Use your Supabase Project URL and a Publishable Key. Secret and service-role keys are not supported.";
  }
}
