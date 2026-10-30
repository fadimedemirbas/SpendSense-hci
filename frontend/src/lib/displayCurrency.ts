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

/**
 * Entries and goals follow the same rule: a record in USD/EUR can only be saved
 * through protocol 3, so this build offers it only once that is active.
 */
export const canSaveRecordCurrency = canSaveDisplayCurrency;

/** Currency for a new entry or goal: the display currency when it can be saved, else TRY. */
export function defaultRecordCurrency(
  displayCurrency: Currency,
  protocol: number = CLIENT_PROTOCOL,
): Currency {
  return canSaveRecordCurrency(displayCurrency, protocol) ? displayCurrency : "TRY";
}

/**
 * Options for an entry's or goal's currency. A saved record keeps its currency
 * (`locked`): the other options are disabled so its amounts are never reinterpreted.
 */
export function recordCurrencyOptions(
  protocol: number = CLIENT_PROTOCOL,
  locked?: Currency,
): readonly DisplayCurrencyOption[] {
  return displayCurrencyOptions(protocol).map((option) =>
    locked && option.value !== locked ? { ...option, disabled: true } : option,
  );
}

/** The explanation shown with the selector (an English key for useT()). */
export function displayCurrencyNote(protocol: number = CLIENT_PROTOCOL): string {
  return protocol === 3
    ? "Totals are shown in this currency. Your records keep their original amounts."
    : "USD and EUR become available when multi-currency support is turned on. Amounts stay in TRY until then.";
}

/** Shown with an entry's or goal's currency choice while USD/EUR cannot be saved. */
export function recordCurrencyNote(protocol: number = CLIENT_PROTOCOL): string | null {
  return protocol === 3 ? null : displayCurrencyNote(protocol);
}
