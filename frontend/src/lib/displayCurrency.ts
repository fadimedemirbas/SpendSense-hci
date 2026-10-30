// Which display currencies this build may offer. Saving USD/EUR needs the
// currency-aware workspace protocol (3): the TRY-only protocol 1 cannot store
// them, and prepareVersionedWorkspaceSave refuses such a save before any request.
// While CLIENT_PROTOCOL is 1, USD and EUR are shown but not selectable, so the
// screen never shows a choice that was not saved.
import { CURRENCIES, CURRENCY_SYMBOL, type Currency } from "./currency.ts";
import { CLIENT_PROTOCOL } from "./workspaceProtocol.ts";

export function canSaveDisplayCurrency(currency: Currency, protocol: number = CLIENT_PROTOCOL) {
  return currency === "TRY" || protocol === 3;
}

export interface DisplayCurrencyOption {
  readonly value: Currency;
  /** Short, language-independent label, e.g. "$ USD". */
  readonly label: string;
  readonly disabled: boolean;
}
export function displayCurrencyOptions(
  protocol: number = CLIENT_PROTOCOL,
): readonly DisplayCurrencyOption[] {
  return CURRENCIES.map((value) => ({
    value,
    label: `${CURRENCY_SYMBOL[value]} ${value}`,
    disabled: !canSaveDisplayCurrency(value, protocol),
  }));
}

/** The explanation shown with the selector (an English key for useT()). */
export function displayCurrencyNote(protocol: number = CLIENT_PROTOCOL): string {
  return protocol === 3
    ? "Totals are shown in this currency. Your records keep their original amounts."
    : "USD and EUR become available when multi-currency support is turned on. Amounts stay in TRY until then.";
}
