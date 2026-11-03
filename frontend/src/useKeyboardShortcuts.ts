import { useEffect } from "react";
import { resolveShortcut } from "./lib/keyboardShortcuts";

const editing = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest(
    "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
  );

export function useKeyboardShortcuts({
  enabled,
  blocked,
  onNewExpense,
  onDecide,
  onHelp,
}: {
  enabled: boolean;
  blocked: boolean;
  onNewExpense: () => void;
  onDecide: () => void;
  onHelp: () => void;
}) {
  useEffect(() => {
    if (!enabled || blocked) return;
    const onKey = (event: KeyboardEvent) => {
      const action = resolveShortcut(
        event,
        editing(event.target) || editing(document.activeElement),
      );
      if (!action || document.querySelector("fieldset[disabled], [data-shortcuts-block]")) return;
      // Local menus, forms and help retain their keyboard behavior and draft data.
      if (
        Array.from(
          document.querySelectorAll(
            "[role='dialog'], [role='alertdialog'], [role='menu'], [role='tooltip']",
          ),
        ).some(
          (element) =>
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== "hidden",
        )
      )
        return;
      event.preventDefault();
      if (action === "expense") onNewExpense();
      else if (action === "decide") onDecide();
      else onHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, blocked, onNewExpense, onDecide, onHelp]);
}
