import { useSyncExternalStore } from "react";
import { DARK_QUERY, createThemeController, type ThemeController } from "./lib/theme";

// One controller per page, created at start-up (main.tsx) so the device setting
// is followed on every screen, including before sign-in.
let controller: ThemeController | null = null;
export function themeController(): ThemeController {
  controller ??= createThemeController({
    storage: (() => {
      try {
        return window.localStorage;
      } catch {
        return null; // storage blocked: the theme still works for this visit
      }
    })(),
    media: typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null,
    doc: document,
  });
  return controller;
}

/** The theme preference and the theme in use, updated live. */
export function useTheme() {
  const theme = themeController();
  const state = useSyncExternalStore(theme.subscribe, theme.getState, theme.getState);
  return { ...state, setPreference: theme.setPreference };
}
