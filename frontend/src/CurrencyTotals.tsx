import { RefreshCw } from "lucide-react";
import { CURRENCIES, type Currency, type Subtotals } from "./lib/currency";
import { useApp } from "./context";
import {
  NO_RATES,
  displayValue,
  needsConversion,
  summarizeEntries,
  usableRates,
  type ConvertedSum,
  type RateInfo,
  type RatesView,
} from "./lib/moneyTotals";
import { ratesClient, useRates } from "./lib/useRates";
import type { Entry } from "./store";
import { Card, fmtIn, useT } from "./ui";

// Every amount is shown in the display currency (Profile.displayCurrency). Records
// keep their original amount and currency in storage; conversion happens only on
// screen, with validated TCMB rates. Rates are requested only when something is in
// another currency, so a single-currency workspace never depends on them.

/** Display-currency formatting for any record, with the rates it needs. */
export function useDisplayMoney() {
  const { profile, entries, goals, waiting, decisions } = useApp();
  const target = profile.displayCurrency;
  const needed = [entries, goals, waiting, decisions].some((list) =>
    list.some((record) => record.currency !== target),
  );
  const rates = useRates(needed);
  const value = (amount: number, currency: Currency) =>
    displayValue(amount, currency, target, rates);
  return {
    target,
    rates,
    value,
    /** Formatted in the display currency, or in its own currency without rates. */
    text: (amount: number, currency: Currency) => {
      const shown = value(amount, currency);
      return shown.ok ? fmtIn(shown.amount, shown.currency) : fmtIn(amount, currency);
    },
  };
}
export type DisplayMoney = ReturnType<typeof useDisplayMoney>;

/**
 * An amount in the display currency; when it was converted, the original amount
 * is shown underneath. Without rates the original amount is shown on its own.
 */
export function DisplayAmount({
  amount,
  currency,
  money,
  sign = "",
  className = "",
}: {
  amount: number;
  currency: Currency;
  money: DisplayMoney;
  sign?: string;
  className?: string;
}) {
  const value = money.value(amount, currency);
  return (
    <span className={`inline-grid justify-items-end ${className}`}>
      <span>
        {sign}
        {value.ok ? fmtIn(value.amount, value.currency) : fmtIn(amount, currency)}
      </span>
      {value.ok && value.converted && (
        <span className="text-xs text-soft font-normal">
          {sign}
          {fmtIn(amount, currency)}
        </span>
      )}
    </span>
  );
}

/**
 * One note per screen for its records in other currencies: a warning when the
 * rates used may be out of date, or why the original currencies are shown.
 * Rate details and the last update are shown only in Settings.
 */
export function ConversionNote({
  money,
  currencies,
}: {
  money: DisplayMoney;
  currencies: readonly Currency[];
}) {
  if (!currencies.some((currency) => currency !== money.target)) return null;
  const usable = usableRates(money.rates);
  if (usable) return <RateNote rate={usable.rate} />;
  return (
    <RatesUnavailable
      loading={money.rates.loading}
      message="Exchange rates are unavailable right now, so amounts are shown in their own currency."
    />
  );
}

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
  if (sum.kind === "approximate") return fmtIn(sum.amount, sum.currency);
  if (sum.kind === "unavailable") return subtotalText(sum.subtotals) || "—";
  return "—";
}

/** Warns when a converted value used rates that may be out of date. */
export function RateNote({ rate }: { rate: RateInfo }) {
  const t = useT();
  if (rate.status !== "stale") return null;
  return (
    <p role="status" className="m-0 text-sm text-attn font-medium">
      {t("These rates may be out of date.")}
    </p>
  );
}

export function RatesUnavailable({
  loading,
  message = "Exchange rates are unavailable right now, so amounts in different currencies are not added together.",
  retry = true,
}: {
  loading: boolean;
  /** False where the same screen already offers "Try again" (one button per screen). */
  retry?: boolean;
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
      {retry && (
        <button
          type="button"
          onClick={() => void ratesClient().refresh({ force: true })}
          className="btn clay-cream min-h-11 inline-flex items-center gap-2"
        >
          <RefreshCw size={16} aria-hidden />
          {t("Try again")}
        </button>
      )}
    </div>
  );
}

function SummaryCard({
  entries,
  currency,
  view,
  title,
  loading = false,
}: {
  entries: readonly Entry[];
  currency: Currency;
  view: RatesView;
  title: string;
  loading?: boolean;
}) {
  const t = useT();
  const summary = summarizeEntries(entries, currency, view);
  const sums = [summary.income, summary.spent, summary.left];
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
        <h2 className="f-ui text-soft text-base m-0">{title}</h2>
        {unavailable && <p className="m-0 text-sm text-soft">{t("By currency")}</p>}
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
      ) : (
        // Money's ConversionNote below offers "Try again" for the whole screen.
        unavailable && <RatesUnavailable loading={loading} retry={false} />
      )}
    </Card>
  );
}

function LiveSummaryCard(props: { entries: readonly Entry[]; currency: Currency; title: string }) {
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
  title,
}: {
  /** The entries of the month being shown. */
  entries: readonly Entry[];
  currency: Currency;
  title: string;
}) {
  return needsConversion(entries, currency) ? (
    <LiveSummaryCard entries={entries} currency={currency} title={title} />
  ) : (
    <SummaryCard entries={entries} currency={currency} view={NO_RATES} title={title} />
  );
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

/** "saved / target" of a goal in the display currency, with the original underneath. */
export function GoalAmounts({
  saved,
  target,
  currency,
  money,
  className = "",
}: {
  saved: number;
  target: number;
  currency: Currency;
  money: DisplayMoney;
  className?: string;
}) {
  const shownSaved = money.value(saved, currency);
  const shownTarget = money.value(target, currency);
  const converted = shownSaved.ok && shownTarget.ok && shownSaved.converted;
  return (
    <>
      <p className={`f-num m-0 ${className}`}>
        {money.text(saved, currency)} / {money.text(target, currency)}
      </p>
      {converted && (
        <p className="f-num text-xs text-soft m-0">
          {fmtIn(saved, currency)} / {fmtIn(target, currency)}
        </p>
      )}
    </>
  );
}
