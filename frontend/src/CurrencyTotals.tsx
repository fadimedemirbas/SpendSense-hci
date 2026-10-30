import { useContext } from "react";
import { RefreshCw } from "lucide-react";
import { CURRENCIES, currencyName, type Currency, type Subtotals } from "./lib/currency";
import {
  NO_RATES,
  entriesInMonth,
  formatBulletinDate,
  goalEquivalent,
  needsConversion,
  summarizeEntries,
  type ConvertedSum,
  type RateInfo,
  type RatesView,
} from "./lib/moneyTotals";
import { ratesClient, useRates } from "./lib/useRates";
import { today, type Entry, type Goal } from "./store";
import { Card, LangCtx, fmtIn, useT } from "./ui";

// Rates are only requested when a total actually mixes currencies, so a
// TRY-only workspace never depends on (or waits for) exchange rates.

/** "₺1.000 + $50": separate per-currency sums, never added together. */
export const subtotalText = (subtotals: Subtotals) =>
  CURRENCIES.filter((c) => subtotals[c] !== undefined)
    .map((c, i) => {
      const value = subtotals[c]!;
      if (i === 0) return fmtIn(value, c);
      return `${value < 0 ? "−" : "+"} ${fmtIn(Math.abs(value), c)}`;
    })
    .join(" ");

export function sumText(sum: ConvertedSum) {
  if (sum.kind === "exact") return fmtIn(sum.amount, sum.currency);
  if (sum.kind === "approximate") return fmtIn(sum.amount, sum.currency, true);
  if (sum.kind === "unavailable") return subtotalText(sum.subtotals) || "—";
  return "—";
}

/** Bulletin date and freshness for a converted value. */
export function RateNote({ rate }: { rate: RateInfo }) {
  const t = useT();
  const { lang } = useContext(LangCtx);
  return (
    <p className="m-0 text-sm text-soft">
      {t("Approximate. Converted with TCMB rates from {date}.", {
        date: formatBulletinDate(rate.bulletinDate, lang),
      })}
      {rate.status === "stale" && (
        <>
          {" "}
          <b className="text-attn font-medium">{t("These rates may be out of date.")}</b>
        </>
      )}
    </p>
  );
}

export function RatesUnavailable({
  loading,
  message = "Exchange rates are unavailable right now, so amounts in different currencies are not added together.",
}: {
  loading: boolean;
  /** English key for useT(): what cannot be calculated. */
  message?: string;
}) {
  const t = useT();
  if (loading)
    return (
      <p role="status" className="m-0 text-sm text-soft">
        {t("Checking exchange rates…")}
      </p>
    );
  return (
    <div role="status" className="flex flex-wrap items-center gap-2">
      <p className="m-0 text-sm text-attn bg-butter rounded-inner px-3 py-2">{t(message)}</p>
      <button
        type="button"
        onClick={() => void ratesClient().refresh({ force: true })}
        className="btn clay-cream min-h-11 inline-flex items-center gap-2"
      >
        <RefreshCw size={16} aria-hidden />
        {t("Try again")}
      </button>
    </div>
  );
}

function SummaryCard({
  entries,
  currency,
  view,
  loading = false,
}: {
  entries: readonly Entry[];
  currency: Currency;
  view: RatesView;
  loading?: boolean;
}) {
  const t = useT();
  const { lang } = useContext(LangCtx);
  const summary = summarizeEntries(entries, currency, view);
  const sums = [summary.income, summary.spent, summary.left];
  const approximate = sums.find((s) => s.kind === "approximate");
  const unavailable = sums.some((s) => s.kind === "unavailable");
  const invalid = sums.some((s) => s.kind === "invalid");
  const stat = (label: string, sum: ConvertedSum, tone = "") => (
    <div className="grid min-w-0">
      <dt className="f-ui text-sm text-soft">{label}</dt>
      <dd className={`m-0 f-num text-2xl break-words ${tone}`}>{sumText(sum)}</dd>
    </div>
  );
  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="f-ui text-soft text-base m-0">{t("This month")}</h2>
        {(approximate || unavailable) && (
          <p className="m-0 text-sm text-soft">
            {unavailable
              ? t("By currency")
              : t("Totals in {c}", { c: currencyName(currency, lang) })}
          </p>
        )}
      </div>
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        {stat(t("Income"), summary.income, "text-leaf")}
        {stat(t("Spent"), summary.spent)}
        {stat(t("Left"), summary.left)}
      </dl>
      {invalid ? (
        <p role="status" className="m-0 text-sm text-attn">
          {t("Totals could not be calculated.")}
        </p>
      ) : unavailable ? (
        <RatesUnavailable loading={loading} />
      ) : (
        approximate?.kind === "approximate" && <RateNote rate={approximate.rate} />
      )}
    </Card>
  );
}

function LiveSummaryCard(props: { entries: readonly Entry[]; currency: Currency }) {
  const rates = useRates();
  return <SummaryCard {...props} view={rates} loading={rates.loading} />;
}

/**
 * This month's income, spending and what is left, in the display currency.
 * Each entry keeps its original amount; only the totals are converted.
 */
export function MoneySummary({
  entries,
  currency,
}: {
  entries: readonly Entry[];
  currency: Currency;
}) {
  const month = entriesInMonth(entries, today());
  return needsConversion(month, currency) ? (
    <LiveSummaryCard entries={month} currency={currency} />
  ) : (
    <SummaryCard entries={month} currency={currency} view={NO_RATES} />
  );
}

function LiveGoalEquivalent({ goal, currency }: { goal: Goal; currency: Currency }) {
  const t = useT();
  const { lang } = useContext(LangCtx);
  const rates = useRates();
  const equivalent = goalEquivalent(goal, currency, rates);
  if (!equivalent) return null;
  if (equivalent.kind === "unavailable")
    return rates.loading ? null : (
      <p className="m-0 text-sm text-soft">
        {t("Exchange rates are unavailable, so this goal is shown in {c} only.", {
          c: currencyName(goal.currency, lang),
        })}
      </p>
    );
  return (
    <div className="grid gap-1">
      <p className="m-0 text-sm f-num">
        {t("About {saved} of {target} in {c}.", {
          // "About" already says it is approximate, so no extra "≈" here.
          saved: fmtIn(equivalent.saved, currency),
          target: fmtIn(equivalent.target, currency),
          c: currencyName(currency, lang),
        })}
      </p>
      <RateNote rate={equivalent.rate} />
    </div>
  );
}

/** A goal's amounts approximately in the display currency (nothing when it matches). */
export function GoalEquivalentNote({ goal, currency }: { goal: Goal; currency: Currency }) {
  return goal.currency === currency ? null : <LiveGoalEquivalent goal={goal} currency={currency} />;
}

/**
 * Shown instead of a chart or total that would need exchange rates: the amounts
 * per currency (never added together) and why the figure is missing.
 */
export function NeedsRates({
  lines,
  loading,
  message,
}: {
  lines: readonly (readonly [string, Subtotals])[];
  loading: boolean;
  /** English key for useT(). */
  message: string;
}) {
  return (
    <div className="grid gap-2">
      <ul className="m-0 p-0 list-none grid gap-1">
        {lines.map(([label, subtotals]) => (
          <li key={label} className="flex flex-wrap justify-between gap-x-3">
            <span>{label}</span>
            <span className="f-num">{subtotalText(subtotals) || "—"}</span>
          </li>
        ))}
      </ul>
      <RatesUnavailable loading={loading} message={message} />
    </div>
  );
}
