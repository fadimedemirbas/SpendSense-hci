import { useContext } from "react";
import { midRate } from "./lib/currency";
import { formatBulletinDate, type RateInfo } from "./lib/moneyTotals";
import { useRates } from "./lib/useRates";
import { InfoTip, LangCtx, useT } from "./ui";

/**
 * Disclosure reads the existing snapshot; it never fetches or changes calculations.
 * Shown in Settings only, next to the last update time (RatesLastUpdate).
 */
export function ExchangeRateInfo({ rate }: { rate?: RateInfo }) {
  const state = useRates(false);
  const t = useT();
  const { lang } = useContext(LangCtx);
  const matches = !rate || rate.bulletinDate === state.bulletinDate;
  const snapshot = matches ? state.rates?.snapshot : undefined;
  const date = rate?.bulletinDate ?? state.bulletinDate;
  const status = rate?.status ?? state.status;
  const timestamp = (value: string | null | undefined) => {
    if (!value || !Number.isFinite(Date.parse(value))) return null;
    return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", {
      dateStyle: "long",
      timeStyle: "long",
      timeZone: "Europe/Istanbul",
    }).format(new Date(value));
  };
  const fetched = timestamp(snapshot?.fetchedAt);
  const statusText = t(
    status === "fresh"
      ? "Rates are up to date."
      : status === "stale"
        ? "These rates may be out of date."
        : "Exchange rates are unavailable.",
  );
  return (
    <InfoTip label={t("Exchange rate information")}>
      <div className="grid gap-3">
        <dl className="m-0 grid gap-2">
          <div>
            <dt className="font-bold">{t("Exchange rate source")}</dt>
            <dd className="m-0">
              {snapshot?.source ?? (date ? "TCMB" : t("No validated rate data is available."))}
            </dd>
          </div>
          {date && (
            <div>
              <dt className="font-bold">{t("Bulletin publication date")}</dt>
              <dd className="m-0">
                {formatBulletinDate(date, lang)}
                {snapshot?.bulletin ? ` · ${snapshot.bulletin}` : ""}
              </dd>
            </div>
          )}
          {fetched && (
            <div>
              <dt className="font-bold">{t("Source last fetched by SpendSense")}</dt>
              <dd className="m-0">{fetched}</dd>
            </div>
          )}
          <div>
            <dt className="font-bold">{t("Exchange rate status")}</dt>
            <dd className="m-0">{statusText}</dd>
          </div>
        </dl>
        {date && (
          <p className="m-0 text-soft">
            {t("The bulletin provides a date, not a publication time.")}
          </p>
        )}
        {snapshot && state.rates && (
          <p className="m-0 f-num">
            {(["USD", "EUR"] as const)
              .map((currency) => {
                const midpoint = midRate(currency, state.rates!);
                return `1 ${currency} = ${new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-GB", {
                  maximumFractionDigits: 7,
                }).format(Number(midpoint))} TRY`;
              })
              .join(" · ")}
          </p>
        )}
        <div className="grid gap-2">
          <h3 className="m-0 text-sm font-bold">{t("How conversion works")}</h3>
          <p className="m-0">
            {t(
              "SpendSense uses the midpoint of TCMB forex buying and selling rates: (buying + selling) / 2. This midpoint is calculated by SpendSense, not published by TCMB.",
            )}
          </p>
          <p className="m-0">
            {t(
              "TRY has a rate of 1. Converted amount = original amount × source currency's TRY rate / target currency's TRY rate. USD and EUR conversions use TRY as the common base.",
            )}
          </p>
          <p className="m-0">
            {t(
              "Amounts are rounded once to the nearest kuruş or cent, with halves rounded away from zero. Converted totals are approximate because exchange rates change; original records stay unchanged.",
            )}
          </p>
          {status === "unavailable" && (
            <p className="m-0 text-attn">
              {t(
                "Without validated rates, foreign amounts stay in their original currency and mixed-currency totals are not calculated.",
              )}
            </p>
          )}
        </div>
      </div>
    </InfoTip>
  );
}

/** When this app last received validated rates; nothing is shown as a time without one. */
export function RatesLastUpdate() {
  const state = useRates(false);
  const t = useT();
  const { lang } = useContext(LangCtx);
  const received =
    state.receivedAt && Number.isFinite(Date.parse(state.receivedAt))
      ? new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Istanbul",
          timeZoneName: "short",
        }).format(new Date(state.receivedAt))
      : null;
  return (
    <span className="block">
      {t("Last exchange rate update")}:{" "}
      {received ? (
        <time dateTime={state.receivedAt!} className="f-num">
          {received}
        </time>
      ) : (
        t("No successful update yet.")
      )}
    </span>
  );
}
