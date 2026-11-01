// Categories whose entries ask "Delete this entry?" before deleting. One list per
// device (localStorage "ss.confirmDelete", like "ss.theme"); nothing is stored in
// Supabase. Keys are "<type>:<category>" because "Other" exists for both types.

import type { EType } from "../store";

export const CONFIRM_DELETE_KEY = "ss.confirmDelete";
export const categoryKey = (type: EType, cat: string) => `${type}:${cat}`;
export const parseCategoryKey = (key: string): [EType, string] => {
  const i = key.indexOf(":");
  return [key.slice(0, i) as EType, key.slice(i + 1)];
};
const isCategoryKey = (value: unknown): value is string =>
  typeof value === "string" && /^(income|expense):.+/.test(value);

export interface ConfirmStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
/** Saved categories; anything missing, invalid or unreadable means none. */
export function readConfirmCategories(storage: ConfirmStorage | null): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(CONFIRM_DELETE_KEY) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter(isCategoryKey))] : [];
  } catch {
    return [];
  }
}
/** Saves the list; returns false when storage is blocked (it still applies this visit). */
export function writeConfirmCategories(storage: ConfirmStorage | null, keys: string[]) {
  try {
    if (!storage) return false;
    storage.setItem(CONFIRM_DELETE_KEY, JSON.stringify(keys));
    return true;
  } catch {
    return false;
  }
}

/** The single source for the list; subscribers (React) are told about every change. */
export function createConfirmController(storage: ConfirmStorage | null) {
  let keys: readonly string[] = Object.freeze(readConfirmCategories(storage));
  const listeners = new Set<() => void>();
  const set = (next: string[]) => {
    keys = Object.freeze([...new Set(next.filter(isCategoryKey))]);
    writeConfirmCategories(storage, [...keys]);
    listeners.forEach((listener) => listener());
  };
  return {
    getKeys: () => keys,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    needsConfirm: (type: EType, cat: string) => keys.includes(categoryKey(type, cat)),
    add: (type: EType, cat: string) => set([...keys, categoryKey(type, cat)]),
    remove: (key: string) => set(keys.filter((k) => k !== key)),
  };
}
export type ConfirmController = ReturnType<typeof createConfirmController>;
