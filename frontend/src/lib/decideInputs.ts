// Decide in any supported currency, with the scoring unchanged. analyze() works
// in lira, so its inputs go through the existing toAnalysisInputs() boundary:
// lira copies made with one validated rate snapshot. Only this month's entries
// are passed (analyze() reads nothing else), so an old foreign entry never
// blocks an analysis. The purchase, goal and entries themselves are not changed.
// Without usable rates, a calculation that needs them is refused, never guessed.
import { analyze, type Entry, type Goal, type Profile, type Purchase } from "../store.ts";
import { toAnalysisInputs } from "./analysisInput.ts";
import {
  entriesInMonth,
  needsConversion,
  usableRates,
  type RateInfo,
  type RatesView,
} from "./moneyTotals.ts";

export type DecideContext =
  | {
      readonly ok: true;
      /** analyze() on the lira inputs: identical to before for TRY-only data. */
      readonly analysis: ReturnType<typeof analyze>;
      /** The purchase price in TRY (equal to the original for a TRY purchase). */
      readonly price: number;
      /** This month's income and spending in TRY (what analyze() used). */
      readonly month: { readonly income: number; readonly spent: number };
      /** Present when an amount was converted: the result is approximate. */
      readonly rate: RateInfo | null;
    }
  | { readonly ok: false; readonly reason: "missing-rate" | "invalid-amount" | "out-of-range" };

/** True when analysing `purchase` against `goals` and this month's entries needs rates. */
export function decideNeedsRates(
  purchase: Pick<Purchase, "price" | "currency">,
  goals: readonly Pick<Goal, "target" | "saved" | "currency">[],
  entries: readonly Entry[],
  day: string,
): boolean {
  return (
    needsConversion([{ amount: purchase.price, currency: purchase.currency }], "TRY") ||
    goals.some((goal) => goal.currency !== "TRY") ||
    needsConversion(entriesInMonth(entries, day), "TRY")
  );
}

export function decideContext(
  purchase: Purchase,
  profile: Profile,
  goal: Goal | undefined,
  entries: readonly Entry[],
  view: RatesView,
  day: string,
): DecideContext {
  const usable = usableRates(view);
  const inputs = toAnalysisInputs(
    purchase,
    goal,
    entriesInMonth(entries, day),
    usable?.rates ?? null,
  );
  if (!inputs.ok) return inputs;
  const income = inputs.entries
    .filter((entry) => entry.type === "income")
    .reduce((a, b) => a + b.amount, 0);
  const spent = inputs.entries
    .filter((entry) => entry.type === "expense")
    .reduce((a, b) => a + b.amount, 0);
  return {
    ok: true,
    analysis: analyze(inputs.purchase, profile, inputs.goal, inputs.entries),
    price: inputs.purchase.price,
    month: { income, spent },
    rate: inputs.converted && usable ? usable.rate : null,
  };
}
