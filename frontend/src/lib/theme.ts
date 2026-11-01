// Light / Dark / System theme. One preference per device (localStorage "ss.theme",
// like "ss.lang"); nothing is stored in Supabase. The resolved theme is applied as
// <html data-theme="light|dark">; index.css swaps the colour tokens for it.
// index.html runs the same resolution inline before the first paint (no flash);
// keep THEME_KEY and THEME_COLORS in sync with that script (a unit test checks).

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];
export const THEME_KEY = "ss.theme";
/** The page background of each theme, for <meta name="theme-color"> (browser UI). */
export const THEME_COLORS: Readonly<Record<ResolvedTheme, string>> = Object.freeze({
  light: "#fff6ec",
  dark: "#1a1219",
});
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
/** Stored preference; anything missing, invalid or unreadable means "system". */
export function readThemePreference(storage: ThemeStorage | null): ThemePreference {
  try {
    const value = storage?.getItem(THEME_KEY);
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}
/** Saves the preference; returns false when storage is blocked (the theme still applies). */
export function writeThemePreference(storage: ThemeStorage | null, value: ThemePreference) {
  try {
    if (!storage) return false;
    storage.setItem(THEME_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export const resolveTheme = (preference: ThemePreference, systemDark: boolean): ResolvedTheme =>
  preference === "system" ? (systemDark ? "dark" : "light") : preference;

/** Applies a resolved theme to the document: tokens, native controls, browser UI colour. */
export function applyTheme(theme: ResolvedTheme, doc: Document) {
  const root = doc.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}
export interface ThemeControllerOptions {
  storage: ThemeStorage | null;
  media: MediaQueryLike | null;
  doc: Document | null;
}
export interface ThemeState {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
}

/**
 * The single theme source for the app: reads the saved preference, follows the
 * device while the preference is "system", and applies every change immediately
 * (no reload). Subscribers (React) are told about every change.
 */
export function createThemeController({ storage, media, doc }: ThemeControllerOptions) {
  let preference = readThemePreference(storage);
  const systemDark = () => media?.matches === true;
  let state: ThemeState = Object.freeze({
    preference,
    resolved: resolveTheme(preference, systemDark()),
  });
  const listeners = new Set<() => void>();
  const update = () => {
    const resolved = resolveTheme(preference, systemDark());
    if (resolved !== state.resolved || preference !== state.preference)
      state = Object.freeze({ preference, resolved });
    if (doc) applyTheme(state.resolved, doc);
    listeners.forEach((listener) => listener());
  };
  // The device setting only matters while the preference is "system".
  media?.addEventListener("change", () => {
    if (preference === "system") update();
  });
  if (doc) applyTheme(state.resolved, doc);
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setPreference(next: ThemePreference) {
      if (!isThemePreference(next)) return;
      preference = next;
      writeThemePreference(storage, next);
      update();
    },
  };
}
export type ThemeController = ReturnType<typeof createThemeController>;
