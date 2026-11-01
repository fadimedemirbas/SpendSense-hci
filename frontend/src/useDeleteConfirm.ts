import { useSyncExternalStore } from "react";
import { createConfirmController, type ConfirmController } from "./lib/deleteConfirm";

// One controller per page so Settings and Money always see the same list.
let controller: ConfirmController | null = null;
function confirmController(): ConfirmController {
  controller ??= createConfirmController(
    (() => {
      try {
        return window.localStorage;
      } catch {
        return null; // storage blocked: the list still works for this visit
      }
    })(),
  );
  return controller;
}

/** Categories that ask before an entry is deleted, updated live. */
export function useDeleteConfirm() {
  const c = confirmController();
  const keys = useSyncExternalStore(c.subscribe, c.getKeys, c.getKeys);
  return { keys, needsConfirm: c.needsConfirm, add: c.add, remove: c.remove };
}
