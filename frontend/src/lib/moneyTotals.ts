// Money in the display currency. Pure functions only. Records are never converted
// in place: every record keeps its original amount and currency in storage, and a
// conversion is a view computed from one validated TCMB rate snapshot.
// Different currencies are never added without valid rates; the caller gets the
// separate per-currency subtotals instead.
import {
  CURRENCY_SYMBOL,
  convertAmount,
  formatMoney,
  totalIn,
  type Currency,
  type Lang,
  type Money,
  type Subtotals,
  type ValidRates,
} from "./currency.ts";
import type { RatesStatus } from "./rates.ts";
import type { Entry, Goal } from "../store.ts";

export type AmountMode = "symbol" | "code";

/**
 * Every amount in the app, with Turkish separators: two decimals when there are
 * kuruş/cents (₺12.345,67, ₺129,50) and none for whole amounts (₺52.340), in
 * "symbol" or "code" (52.340 TRY) mode. Rounded half away from zero to the cent.
 */
export function formatAmount(amount: number, currency: Currency, mode: AmountMode): string {
  return formatMoney(amount, currency, "tr", { display: mode, fraction: "auto" });
}

/** The unit shown next to an amount field: "₺" / "TRY", "$" / "USD". */
export const amountUnit = (currency: Currency, mode: AmountMode) =>
  mode === "symbol" ? CURRENCY_SYMBOL[currency] : currency;

/** TCMB bulletin date for display, e.g. "29 Ekim 2026" / "29 October 2026". */
export function formatBulletinDate(date: string, lang: Lang): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The part of the rates state these calculations read. */
export interface RatesView {
  readonly status: RatesStatus;
  readonly rates: ValidRates | null;
  readonly bulletinDate: string | null;
}
export const NO_RATES: RatesView = Object.freeze({
  status: "unavailable",
  rates: null,
  bulletinDate: null,
});
/** Rates that may be used for a conversion: validated and not "unavailable". */
export function usableRates(view: RatesView): { rates: ValidRates; rate: RateInfo } | null {
  return view.status !== "unavailable" && view.rates && view.bulletinDate
    ? { rates: view.rates, rate: { status: view.status, bulletinDate: view.bulletinDate } }
    : null;
}
export interface RateInfo {
  readonly status: "fresh" | "stale";
  readonly bulletinDate: string;
}

export type ConvertedSum =
  /** Every item is already in the target currency: exact, no rate used. */
  | { readonly kind: "exact"; readonly amount: number; readonly currency: Currency }
  /** Converted with `rate`; never present without a validated snapshot. */
  | {
      readonly kind: "approximate";
      readonly amount: number;
      readonly currency: Currency;
      readonly subtotals: Subtotals;
      readonly rate: RateInfo;
    }
  /** Mixed currencies and no usable rates: nothing was added across currencies. */
  | { readonly kind: "unavailable"; readonly subtotals: Subtotals }
  | { readonly kind: "invalid" };

/** True when showing `items` in `target` needs an exchange rate. */
export function needsConversion(items: readonly Money[], target: Currency): boolean {
  return items.some((item) => item.currency !== target && item.amount !== 0);
}

/** Sum of `items` in `target`, converted only with validated rates. */
export function sumIn(items: readonly Money[], target: Currency, view: RatesView): ConvertedSum {
  const usable = usableRates(view);
  const result = totalIn(items, target, usable?.rates ?? null);
  if (result.ok) {
    if (!result.approximate) return { kind: "exact", amount: result.amount, currency: target };
    if (!usable) return { kind: "invalid" }; // unreachable: approximate needs rates
    return {
      kind: "approximate",
      amount: result.amount,
      currency: target,
      subtotals: result.subtotals,
      rate: usable.rate,
    };
  }
  if (result.reason === "missing-rate" && result.subtotals)
    return { kind: "unavailable", subtotals: result.subtotals };
  return { kind: "invalid" };
}

/** Entries dated in the same calendar month as `day` (YYYY-MM-DD). */
export const entriesInMonth = (entries: readonly Entry[], day: string) =>
  entries.filter((entry) => entry.date.slice(0, 7) === day.slice(0, 7));

const money = (entry: Entry, sign = 1): Money => ({
  amount: entry.amount * sign,
  currency: entry.currency,
});

export interface MoneySummary {
  readonly income: ConvertedSum;
  readonly spent: ConvertedSum;
  /** Income minus spending, converted together with one rounding. */
  readonly left: ConvertedSum;
}
/** Income, spending and what is left for `entries`, shown in `target`. */
export function summarizeEntries(
  entries: readonly Entry[],
  target: Currency,
  view: RatesView,
): MoneySummary {
  const income = entries.filter((entry) => entry.type === "income");
  const spent = entries.filter((entry) => entry.type === "expense");
  return {
    income: sumIn(
      income.map((entry) => money(entry)),
      target,
      view,
    ),
    spent: sumIn(
      spent.map((entry) => money(entry)),
      target,
      view,
    ),
    left: sumIn(
      [...income.map((entry) => money(entry)), ...spent.map((entry) => money(entry, -1))],
      target,
      view,
    ),
  };
}

/* ---------- goals ---------- */

/** Target suggestions in the goal's own currency (never converted). */
export function goalTargetIdeas(currency: Currency): readonly number[] {
  return currency === "TRY" ? [5000, 10000, 25000, 50000] : [500, 1000, 2500, 5000];
}

/** Progress in the goal's own currency: no rate is ever involved. */
export function goalProgress(goal: Pick<Goal, "saved" | "target">): number {
  return goal.target > 0 ? Math.round((goal.saved / goal.target) * 100) : 0;
}

export type DisplayValue =
  | {
      readonly ok: true;
      /** The amount in the display currency. */
      readonly amount: number;
      readonly currency: Currency;
      /** True when a rate was used (the record is in another currency). */
      readonly converted: boolean;
    }
  /** Another currency and no usable rates: show the original amount instead. */
  | { readonly ok: false };

/** One record's amount shown in `target`, converted only with validated rates. */
export function displayValue(
  amount: number,
  currency: Currency,
  target: Currency,
  view: RatesView,
): DisplayValue {
  if (currency === target) return { ok: true, amount, currency, converted: false };
  const usable = usableRates(view);
  if (!usable) return { ok: false };
  const result = convertAmount(amount, currency, target, usable.rates);
  return result.ok
    ? { ok: true, amount: result.amount, currency: target, converted: true }
    : { ok: false };
}
