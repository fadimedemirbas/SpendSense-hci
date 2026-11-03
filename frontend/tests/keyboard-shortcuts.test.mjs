import assert from "node:assert/strict";
import test from "node:test";
import {
  SHORTCUTS_KEY,
  readShortcutPreference,
  resolveShortcut,
  writeShortcutPreference,
} from "../src/lib/keyboardShortcuts.ts";

const event = (key, overrides = {}) => ({
  key,
  defaultPrevented: false,
  repeat: false,
  isComposing: false,
  keyCode: 0,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...overrides,
});

test("character shortcuts are off until explicitly enabled, including with blocked storage", () => {
  for (const value of [null, "false", "1", "TRUE", "invalid"])
    assert.equal(readShortcutPreference({ getItem: () => value }), false);
  assert.equal(readShortcutPreference(null), false);
  assert.equal(
    readShortcutPreference({
      getItem: () => {
        throw Error("blocked");
      },
    }),
    false,
  );
  assert.equal(readShortcutPreference({ getItem: () => "true" }), true);
});

test("the device preference persists and blocked writes do not throw", () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  assert.equal(writeShortcutPreference(storage, true), true);
  assert.equal(data.get(SHORTCUTS_KEY), "true");
  assert.equal(readShortcutPreference(storage), true);
  assert.equal(writeShortcutPreference(storage, false), true);
  assert.equal(readShortcutPreference(storage), false);
  assert.equal(writeShortcutPreference(null, true), false);
  assert.equal(
    writeShortcutPreference(
      {
        setItem: () => {
          throw Error("blocked");
        },
      },
      true,
    ),
    false,
  );
});

test("only N, D and the actual question-mark character invoke actions", () => {
  for (const key of ["n", "N"]) assert.equal(resolveShortcut(event(key)), "expense");
  for (const key of ["d", "D"]) assert.equal(resolveShortcut(event(key)), "decide");
  assert.equal(resolveShortcut(event("?")), "help");
  for (const key of ["/", "Enter", "Escape", "Tab", "ArrowLeft", "Delete", "s"])
    assert.equal(resolveShortcut(event(key)), null);
});

test("typing, composition, repeats, consumed events and platform combinations do nothing", () => {
  for (const key of ["n", "d", "?"]) {
    assert.equal(resolveShortcut(event(key), true), null);
    for (const guard of [
      "defaultPrevented",
      "repeat",
      "isComposing",
      "ctrlKey",
      "metaKey",
      "altKey",
    ])
      assert.equal(resolveShortcut(event(key, { [guard]: true })), null, `${key}: ${guard}`);
    assert.equal(resolveShortcut(event(key, { keyCode: 229 })), null);
  }
});
