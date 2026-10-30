// Currency-safe figures for Home and Insights. Built on moneyTotals.ts (one
// validated rate snapshot, one rounding per figure). When nothing needs a rate,
// the figures are computed with exactly the arithmetic these screens used before,
// so TRY-only users see identical numbers. Records are only read, never changed.
import {
  CURRENCIES,
  convertAmount,
  type Currency,
  type Money,
  type Subtotals,
} from "./currency.ts";
import {
  entriesInMonth,
  needsConversion,
  sumIn,
  usableRates,
  type ConvertedSum,
  type RateInfo,
  type RatesView,
} from "./moneyTotals.ts";
import type { Entry, EType, Purchase } from "../store.ts";

const asMoney = (entry: Entry): Money => ({ amount: entry.amount, currency: entry.currency });

/** Per-currency sums of a result (an exact sum is one currency). */
function subtotalsOf(sum: ConvertedSum): Subtotals {
  if (sum.kind === "exact") return sum.amount === 0 ? {} : { [sum.currency]: sum.amount };
  if (sum.kind === "invalid") return {};
  return sum.subtotals;
}
/** Combines results that must all be usable; the first rate found describes them. */
function combine(sums: readonly ConvertedSum[]) {
  if (sums.some((sum) => sum.kind === "invalid")) return { kind: "invalid" as const };
  if (sums.some((sum) => sum.kind === "unavailable")) return { kind: "unavailable" as const };
  const approximate = sums.find((sum) => sum.kind === "approximate");
  return {
    kind: "ok" as const,
    rate: approximate?.kind === "approximate" ? approximate.rate : null,
    amounts: sums.map((sum) =>
      sum.kind === "exact" || sum.kind === "approximate" ? sum.amount : 0,
    ),
  };
}

/* ---------- Home: this month ---------- */

export type MonthView =
  /** No conversion needed: the same sums Home showed before (monthTotals arithmetic). */
  | {
      readonly kind: "exact";
      readonly currency: Currency;
      readonly income: number;
      readonly spent: number;
    }
  | {
      readonly kind: "approximate";
      readonly currency: Currency;
      readonly income: number;
      readonly spent: number;
      readonly rate: RateInfo;
    }
  /** Mixed currencies without usable rates: only per-currency sums, never a total. */
  | { readonly kind: "unavailable"; readonly income: Subtotals; readonly spent: Subtotals }
  | { readonly kind: "invalid" };

/** This month's income and spending in `target` (the display currency). */
export function monthView(
  entries: readonly Entry[],
  target: Currency,
  view: RatesView,
  day: string,
): MonthView {
  const month = entriesInMonth(entries, day);
  if (!needsConversion(month.map(asMoney), target)) {
    const sum = (type: EType) =>
      month.filter((e) => e.type === type).reduce((a, b) => a + b.amount, 0);
    return { kind: "exact", currency: target, income: sum("income"), spent: sum("expense") };
  }
  const income = sumIn(month.filter((e) => e.type === "income").map(asMoney), target, view);
  const spent = sumIn(month.filter((e) => e.type === "expense").map(asMoney), target, view);
  const both = combine([income, spent]);
  if (both.kind === "invalid") return both;
  if (both.kind === "unavailable")
    return { kind: "unavailable", income: subtotalsOf(income), spent: subtotalsOf(spent) };
  return {
    kind: "approximate",
    currency: target,
    income: both.amounts[0],
    spent: both.amounts[1],
    rate: both.rate!,
  };
}

/**
 * Average price in TRY, only used to compare two groups of decisions.
 * null: no items (as before). undefined: cannot be compared without rates.
 */
export function averagePriceInTry(
  items: readonly Pick<Purchase, "price" | "currency">[],
  view: RatesView,
): number | null | undefined {
  if (items.length === 0) return null;
  if (items.every((item) => item.currency === "TRY"))
    return items.reduce((a, b) => a + b.price, 0) / items.length;
  const usable = usableRates(view);
  if (!usable) return undefined;
  let total = 0;
  for (const item of items) {
    const result = convertAmount(item.price, item.currency, "TRY", usable.rates);
    if (!result.ok) return undefined;
    total += result.amount;
  }
  return total / items.length;
}

/* ---------- Insights: spending charts ---------- */

export type SpendingView =
  | {
      readonly kind: "ok";
      readonly currency: Currency;
      /** Present when a rate was used: every amount below is approximate. */
      readonly rate: RateInfo | null;
      /** Top five expense categories, largest first. */
      readonly byCat: readonly (readonly [string, number])[];
      readonly income: number;
      readonly spent: number;
      /** Denominator of the category bars (spent, or 1 when nothing was spent). */
      readonly total: number;
      /** Scale of the income vs. expenses bars. */
      readonly max: number;
    }
  | { readonly kind: "unavailable"; readonly income: Subtotals; readonly spent: Subtotals }
  | { readonly kind: "invalid" };

/** The Insights money charts for this month, in `target`. */
export function spendingView(
  entries: readonly Entry[],
  target: Currency,
  view: RatesView,
  day: string,
): SpendingView {
  const month = entriesInMonth(entries, day);
  const exp = month.filter((e) => e.type === "expense");
  const incomeEntries = month.filter((e) => e.type === "income");
  if (!needsConversion(month.map(asMoney), target)) {
    // Exactly the previous Insights arithmetic.
    const total = exp.reduce((a, b) => a + b.amount, 0) || 1;
    const byCat = Object.entries(
      exp.reduce<Record<string, number>>(
        (g, e) => ((g[e.cat] = (g[e.cat] ?? 0) + e.amount), g),
        {},
      ),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const income = incomeEntries.reduce((a, b) => a + b.amount, 0);
    return {
      kind: "ok",
      currency: target,
      rate: null,
      byCat,
      income,
      spent: exp.reduce((a, b) => a + b.amount, 0),
      total,
      max: Math.max(income, total),
    };
  }
  const cats = [...new Set(exp.map((e) => e.cat))];
  const catSums = cats.map((cat) =>
    sumIn(exp.filter((e) => e.cat === cat).map(asMoney), target, view),
  );
  const income = sumIn(incomeEntries.map(asMoney), target, view);
  const spent = sumIn(exp.map(asMoney), target, view);
  const all = combine([income, spent, ...catSums]);
  if (all.kind === "invalid") return all;
  if (all.kind === "unavailable")
    return { kind: "unavailable", income: subtotalsOf(income), spent: subtotalsOf(spent) };
  const [incomeAmount, spentAmount, ...catAmounts] = all.amounts;
  const total = spentAmount || 1;
  return {
    kind: "ok",
    currency: target,
    rate: all.rate,
    byCat: cats
      .map((cat, i) => [cat, catAmounts[i]] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    income: incomeAmount,
    spent: spentAmount,
    total,
    max: Math.max(incomeAmount, total),
  };
}

/** True when a subtotal map has any amount (used to decide what to list). */
export const hasSubtotals = (subtotals: Subtotals) =>
  CURRENCIES.some((currency) => subtotals[currency] !== undefined);
