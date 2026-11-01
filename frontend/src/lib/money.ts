// Exact amount formatting for the Decide flow, the same as every other amount:
// Turkish separators, two decimals only when there are kuruş (₺2.499,90, ₺2.500),
// in both UI languages. The number itself is never changed or stored.
import { formatAmount } from "./moneyTotals.ts";

export type CurrencyMode = "symbol" | "code";

/** `_lang` is kept for existing callers; the format no longer depends on it. */
export function formatExactAmount(value: number, _lang: "en" | "tr", mode: CurrencyMode) {
  return formatAmount(value, "TRY", mode);
}
