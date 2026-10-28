// Integration boundary for Decide (not wired in yet). analyze() in store.ts is
// unchanged and works in lira (its income/savings fallbacks are TRY). This turns
// a mixed-currency purchase, goal and entries into lira copies with one rate
// snapshot, so analyze() can be called exactly as today. Originals are untouched.
import type { Entry, Goal, Purchase } from "../store";
import { convertAmount, type ValidRates } from "./currency.ts";

export type AnalysisInputs =
  | {
      readonly ok: true;
      readonly purchase: Purchase;
      readonly goal: Goal | undefined;
      readonly entries: Entry[];
      /** True when any amount was converted with a rate (results are approximate). */
      readonly converted: boolean;
    }
  | { readonly ok: false; readonly reason: "missing-rate" | "invalid-amount" | "out-of-range" };

export function toAnalysisInputs(
  purchase: Purchase,
  goal: Goal | undefined,
  entries: readonly Entry[],
  rates: ValidRates | null,
): AnalysisInputs {
  let converted = false;
  const lira = (amount: number, currency: Purchase["currency"]) => {
    const result = convertAmount(amount, currency, "TRY", rates);
    if (!result.ok) throw result.reason;
    converted ||= result.approximate;
    return result.amount;
  };
  try {
    return {
      ok: true,
      purchase: { ...purchase, price: lira(purchase.price, purchase.currency), currency: "TRY" },
      goal: goal && {
        ...goal,
        target: lira(goal.target, goal.currency),
        saved: lira(goal.saved, goal.currency),
        currency: "TRY",
      },
      entries: entries.map((entry) => ({
        ...entry,
        amount: lira(entry.amount, entry.currency),
        currency: "TRY",
      })),
      converted,
    };
  } catch (reason) {
    if (reason === "invalid-currency") return { ok: false, reason: "invalid-amount" };
    return { ok: false, reason: reason as "missing-rate" | "invalid-amount" | "out-of-range" };
  }
}
