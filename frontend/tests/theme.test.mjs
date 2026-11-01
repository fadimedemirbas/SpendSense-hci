import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DARK_QUERY,
  THEME_COLORS,
  THEME_KEY,
  createThemeController,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from "../src/lib/theme.ts";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}
const blockedStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};
function fakeMedia(matches = false) {
  const listeners = new Set();
  return {
    matches,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    set(value) {
      this.matches = value;
      listeners.forEach((listener) => listener());
    },
  };
}
function fakeDocument() {
  const meta = { content: THEME_COLORS.light, setAttribute: (_n, v) => (meta.content = v) };
  return {
    meta,
    documentElement: { dataset: {} },
    querySelector: (selector) => (selector === 'meta[name="theme-color"]' ? meta : null),
  };
}

test("the preference defaults to System and survives blocked or bad storage", () => {
  assert.equal(readThemePreference(memoryStorage()), "system");
  assert.equal(readThemePreference(memoryStorage({ [THEME_KEY]: "neon" })), "system");
  assert.equal(readThemePreference(null), "system");
  assert.equal(readThemePreference(blockedStorage), "system");
  for (const value of ["light", "dark", "system"])
    assert.equal(readThemePreference(memoryStorage({ [THEME_KEY]: value })), value);
  const storage = memoryStorage();
  assert.equal(writeThemePreference(storage, "dark"), true);
  assert.equal(storage.data.get(THEME_KEY), "dark");
  assert.equal(writeThemePreference(blockedStorage, "dark"), false);
  assert.equal(writeThemePreference(null, "dark"), false);
});

test("System resolves to the device theme; Light and Dark ignore it", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  for (const device of [true, false]) {
    assert.equal(resolveTheme("light", device), "light");
    assert.equal(resolveTheme("dark", device), "dark");
  }
});

test("the controller applies changes at once, saves them and follows the device on System", () => {
  const storage = memoryStorage();
  const media = fakeMedia(true);
  const doc = fakeDocument();
  const theme = createThemeController({ storage, media, doc });
  let notified = 0;
  theme.subscribe(() => notified++);
  assert.deepEqual(theme.getState(), { preference: "system", resolved: "dark" });
  assert.equal(doc.documentElement.dataset.theme, "dark");
  assert.equal(doc.meta.content, THEME_COLORS.dark);

  media.set(false); // device switches to light
  assert.equal(theme.getState().resolved, "light");
  assert.equal(doc.documentElement.dataset.theme, "light");

  theme.setPreference("dark");
  assert.deepEqual(theme.getState(), { preference: "dark", resolved: "dark" });
  assert.equal(storage.data.get(THEME_KEY), "dark");
  media.set(false); // ignored while an explicit theme is chosen
  media.set(true);
  media.set(false);
  assert.equal(theme.getState().resolved, "dark");

  theme.setPreference("light");
  assert.equal(doc.documentElement.dataset.theme, "light");
  assert.equal(doc.meta.content, THEME_COLORS.light);
  theme.setPreference("bogus");
  assert.equal(theme.getState().preference, "light");
  assert.ok(notified >= 3);

  // A new page load restores the saved choice.
  const reloaded = createThemeController({ storage, media: fakeMedia(true), doc: fakeDocument() });
  assert.deepEqual(reloaded.getState(), { preference: "light", resolved: "light" });
  // Without storage the theme still works for the visit.
  const unsaved = createThemeController({ storage: blockedStorage, media: null, doc: null });
  unsaved.setPreference("dark");
  assert.equal(unsaved.getState().resolved, "dark");
});

test("index.html applies the same theme before the first paint", () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script, "inline theme script");
  assert.match(script, new RegExp(THEME_KEY.replace(".", "\\.")));
  assert.ok(script.includes(DARK_QUERY));
  // It runs in <head> before the app bundle.
  assert.ok(html.indexOf(script) < html.indexOf('type="module"'));
  for (const stored of [null, "light", "dark", "system", "junk"])
    for (const deviceDark of [false, true]) {
      const doc = fakeDocument();
      const attributes = {};
      doc.documentElement.setAttribute = (name, value) => (attributes[name] = value);
      new Function("localStorage", "window", "document", script)(
        memoryStorage(stored ? { [THEME_KEY]: stored } : {}),
        { matchMedia: () => ({ matches: deviceDark }) },
        doc,
      );
      const preference = ["light", "dark", "system"].includes(stored) ? stored : "system";
      const expected = resolveTheme(preference, deviceDark);
      assert.equal(attributes["data-theme"], expected, `${stored} ${deviceDark}`);
      assert.equal(doc.meta.content, THEME_COLORS[expected]);
    }
});

/* ---------- colour tokens ---------- */

function tokens(block) {
  return Object.fromEntries(
    [...block.matchAll(/--color-([a-z]+):\s*(#[0-9a-f]{6})\b/g)].map((m) => [m[1], m[2]]),
  );
}
const light = tokens(/@theme \{([\s\S]*?)\n\}/.exec(css)[1]);
const dark = { ...light, ...tokens(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/.exec(css)[1]) };
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("Light keeps the original SpendSense palette", () => {
  assert.deepEqual(
    {
      cream: light.cream,
      card: light.card,
      ink: light.ink,
      soft: light.soft,
      coral: light.coral,
      sun: light.sun,
      leaf: light.leaf,
      violet: light.violet,
      danger: light.danger,
    },
    {
      cream: "#fff6ec",
      card: "#fffdf9",
      ink: "#2a1a2c",
      soft: "#6b5a66",
      coral: "#ff6b4a",
      sun: "#ffc93c",
      leaf: "#1f7a58",
      violet: "#6b4fa3",
      danger: "#b3261e",
    },
  );
  assert.equal(light.cream, THEME_COLORS.light);
  assert.equal(dark.cream, THEME_COLORS.dark);
});

test("Dark uses warm plum surfaces (no pure black) and keeps the brand colours", () => {
  for (const name of ["cream", "card", "field", "track", "peach", "butter"])
    assert.notEqual(dark[name], "#000000");
  assert.equal(dark.sun, light.sun);
  assert.ok(luminance(dark.card) > luminance(dark.cream), "cards stand out from the page");
  assert.ok(luminance(dark.cream) > 0.005, "not black");
});

test("text and financial status colours meet WCAG AA in both themes", () => {
  const text = [
    ["ink", "cream"],
    ["ink", "card"],
    ["ink", "field"],
    ["soft", "cream"],
    ["soft", "card"],
    ["soft", "peach"],
    ["soft", "butter"],
    ["ink", "peach"],
    ["ink", "butter"],
    ["ink", "leaftint"],
    ["ink", "violettint"],
    ["leaf", "card"], // income
    ["leafstrong", "leaftint"], // success badges
    ["attn", "butter"], // warnings, stale rates
    ["violet", "violettint"],
    ["violet", "card"],
    ["danger", "card"], // errors
    ["danger", "cream"],
    ["onbright", "sun"],
    ["onbright", "coral"],
    ["onstrong", "leaf"],
    ["onstrong", "violet"],
    ["onstrong", "danger"],
  ];
  for (const [name, palette] of [
    ["light", light],
    ["dark", dark],
  ])
    for (const [fg, bg] of text) {
      const ratio = contrast(palette[fg], palette[bg]);
      // Light reuses the original pairs; the pale-green badge text has its own darker ink.
      assert.ok(ratio >= 4.5, `${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}`);
    }
  // Chart fills against the empty track (non-text contrast, 3:1) and the focus ring.
  for (const [name, palette] of [
    ["light", light],
    ["dark", dark],
  ]) {
    assert.ok(contrast(palette.info, palette.card) >= 3, `${name} focus ring`);
    if (name === "dark")
      for (const fill of ["sun", "leaf", "violet", "coral"])
        assert.ok(contrast(palette[fill], palette.track) >= 3, `${name} ${fill} bar`);
  }
});

test("every Dark token overrides a defined token and colours are not hard-coded elsewhere", () => {
  const darkBlock = /:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/.exec(css)[1];
  for (const name of Object.keys(tokens(darkBlock)))
    assert.ok(name in light, `--color-${name} is defined for Light too`);
  assert.match(darkBlock, /color-scheme: dark/);
  assert.match(css, /:root \{\s*color-scheme: light;/);
});
