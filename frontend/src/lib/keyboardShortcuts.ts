export const SHORTCUTS_KEY = "ss.keyboardShortcuts";

interface ShortcutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Character shortcuts are opt-in on this device; blocked storage keeps them off. */
export function readShortcutPreference(storage: ShortcutStorage | null): boolean {
  try {
    return storage?.getItem(SHORTCUTS_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeShortcutPreference(storage: ShortcutStorage | null, enabled: boolean) {
  try {
    if (!storage) return false;
    storage.setItem(SHORTCUTS_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}

type ShortcutEvent = Pick<
  KeyboardEvent,
  | "key"
  | "defaultPrevented"
  | "repeat"
  | "isComposing"
  | "keyCode"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
>;
export type ShortcutAction = "expense" | "decide" | "help";

export function resolveShortcut(event: ShortcutEvent, editing = false): ShortcutAction | null {
  if (
    editing ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return null;
  switch (event.key.toLowerCase()) {
    case "n":
      return "expense";
    case "d":
      return "decide";
    case "?":
      return "help";
    default:
      return null;
  }
}
