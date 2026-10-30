import type { Currency } from "./lib/currency";
import {
  canSaveDisplayCurrency,
  canSaveRecordCurrency,
  displayCurrencyOptions,
  recordCurrencyOptions,
} from "./lib/displayCurrency";
import { Segmented } from "./ui";

/**
 * TRY / USD / EUR choice for the currency totals are shown in. Options this
 * build cannot save are visible but not selectable (see lib/displayCurrency.ts).
 * Separate from the symbol/code "Amount format" preference (Profile.currency).
 */
export function DisplayCurrencyPicker({
  value,
  onChange,
  label,
  describedBy,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
  label: string;
  describedBy?: string;
}) {
  const options = displayCurrencyOptions();
  return (
    <Segmented
      label={label}
      value={value}
      describedBy={describedBy}
      onChange={(currency) => canSaveDisplayCurrency(currency) && onChange(currency)}
      options={options.map((option) => [option.value, option.label])}
      disabled={options.filter((option) => option.disabled).map((option) => option.value)}
    />
  );
}

/**
 * The currency of one entry or goal. `locked` keeps a saved record's currency:
 * the amounts were entered in it and are never reinterpreted or converted.
 */
export function RecordCurrencyPicker({
  value,
  onChange,
  label,
  describedBy,
  locked = false,
  full,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
  label: string;
  describedBy?: string;
  locked?: boolean;
  full?: boolean;
}) {
  const options = recordCurrencyOptions(undefined, locked ? value : undefined);
  return (
    <Segmented
      full={full}
      label={label}
      value={value}
      describedBy={describedBy}
      onChange={(currency) => !locked && canSaveRecordCurrency(currency) && onChange(currency)}
      options={options.map((option) => [option.value, option.label])}
      disabled={options.filter((option) => option.disabled).map((option) => option.value)}
    />
  );
}
