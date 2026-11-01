import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useApp } from "./context";
import {
  Button,
  Card,
  Dialog,
  Segmented,
  Sheet,
  Tile,
  curLabelIn,
  fmtIn,
  useT,
  useToast,
} from "./ui";
import {
  HOLD_KINDS,
  holdingIcon,
  isMoneyKind,
  today,
  uid,
  type Holding,
  type HoldingKind,
} from "./store";
import type { Currency } from "./lib/currency";
import { defaultRecordCurrency } from "./lib/displayCurrency";
import { RecordCurrencyPicker } from "./DisplayCurrencyPicker";
import { useDeleteConfirm } from "./useDeleteConfirm";
import { dayLabel } from "./Money";

// Savings without a goal: salary surplus, gold, silver, crypto. They are kept as
// entered (an amount, grams or coins) and never valued at today's prices.

const qty = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 8 });
/** "₺5.000", "12,5 g" or "0,015 BTC". */
export const holdingText = (h: Pick<Holding, "kind" | "quantity" | "unit">) =>
  isMoneyKind(h.kind)
    ? fmtIn(h.quantity, h.unit as Currency)
    : `${qty.format(h.quantity)} ${h.unit}`;

export function HoldingRow({ h }: { h: Holding }) {
  const { holdings, setHoldings, setSaveSheet } = useApp();
  const t = useT();
  const toast = useToast();
  const { needsConfirm } = useDeleteConfirm();
  const [confirm, setConfirm] = useState(false);
  const I = holdingIcon(h.kind);
  const remove = async () => {
    const prev = holdings;
    if (!(await setHoldings(holdings.filter((x) => x.id !== h.id)))) return false;
    toast(t("Saving deleted."), () => setHoldings(prev));
  };
  return (
    <li className="entry-row flex items-center gap-3 py-3 border-t border-cardline first:border-0">
      <span className="w-11 h-11 rounded-inner flex items-center justify-center shrink-0 bg-violettint text-violet">
        <I size={20} aria-hidden />
      </span>
      <span className="flex-1 min-w-0">
        <span className="line-clamp-2 font-medium">{h.name}</span>
        <span className="text-sm text-soft">
          {t("Saving")} · {t(h.kind)} · {dayLabel(h.date, t)}
        </span>
      </span>
      <span className="grid justify-items-end shrink-0">
        <span className="f-num text-lg whitespace-nowrap text-violet">+{holdingText(h)}</span>
        {h.price !== undefined && h.priceCurrency && (
          <span className="f-num text-xs text-soft whitespace-nowrap">
            {t("Bought at {p} / {u}", { p: fmtIn(h.price, h.priceCurrency), u: h.unit })}
          </span>
        )}
      </span>
      <span className="entry-actions flex items-center gap-0.5 shrink-0">
        <button
          aria-label={`${t("Edit")} ${h.name}`}
          onClick={() => setSaveSheet(h)}
          className="w-9 h-9 rounded-full inline-flex items-center justify-center text-soft hover:bg-track hover:text-ink"
        >
          <Pencil size={16} aria-hidden />
        </button>
        <button
          aria-label={`${t("Delete")} ${h.name}`}
          onClick={() => (needsConfirm("saving", h.kind) ? setConfirm(true) : void remove())}
          className="w-9 h-9 rounded-full inline-flex items-center justify-center text-soft hover:bg-peach hover:text-danger"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </span>
      {confirm && (
        <Dialog
          danger
          title={t("Delete this saving?")}
          body={t("{n} is in {c}, a category you asked to confirm before deleting.", {
            n: h.name,
            c: t(h.kind),
          })}
          confirm={t("Delete")}
          onClose={() => setConfirm(false)}
          onConfirm={remove}
        />
      )}
    </li>
  );
}

/** What was put aside in a month, per kind and unit. Not part of income or spending. */
export function SavingsSummary({
  holdings,
  title,
}: {
  holdings: readonly Holding[];
  title: string;
}) {
  const t = useT();
  if (holdings.length === 0) return null;
  const totals = new Map<string, Pick<Holding, "kind" | "quantity" | "unit">>();
  for (const h of holdings) {
    const key = `${h.kind}|${h.unit}`;
    const sum = totals.get(key);
    // Rounded to the stored precision so 0.1 + 0.2 shows as 0,3.
    if (sum) sum.quantity = Math.round((sum.quantity + h.quantity) * 1e8) / 1e8;
    else totals.set(key, { kind: h.kind, unit: h.unit, quantity: h.quantity });
  }
  return (
    <Card>
      <section aria-label={title} className="grid gap-2">
        <h2 className="f-ui text-lg m-0">{title}</h2>
        <ul className="m-0 p-0 list-none grid gap-1">
          {[...totals.values()].map((s) => {
            const I = holdingIcon(s.kind);
            return (
              <li key={`${s.kind}|${s.unit}`} className="flex items-center gap-2">
                <I size={18} aria-hidden className="text-violet shrink-0" />
                <span className="flex-1">{t(s.kind)}</span>
                <span className="f-num whitespace-nowrap">{holdingText(s)}</span>
              </li>
            );
          })}
        </ul>
        <p className="m-0 text-sm text-soft">
          {t("Kept as you entered them. Not counted in what's left.")}
        </p>
      </section>
    </Card>
  );
}

/** Up to 12 whole digits and `decimals` decimals; a comma counts as the decimal point. */
const clean = (text: string, decimals: number) => {
  const n = text.replace(",", ".");
  return n === "" || new RegExp(`^\\d{1,12}(\\.\\d{0,${decimals}})?$`).test(n) ? n : null;
};

export function SavingSheet() {
  const { saveSheet, setSaveSheet, holdings, setHoldings, profile } = useApp();
  const t = useT();
  const toast = useToast();
  const edit = typeof saveSheet === "object" ? saveSheet : null;
  const [kind, setKind] = useState<HoldingKind | "">(edit?.kind ?? "");
  const [amount, setAmount] = useState(edit ? String(edit.quantity) : "");
  const [currency, setCurrency] = useState<Currency>(
    edit && isMoneyKind(edit.kind)
      ? (edit.unit as Currency)
      : defaultRecordCurrency(profile.displayCurrency),
  );
  const [coin, setCoin] = useState(edit?.kind === "Crypto" ? edit.unit : "");
  const [price, setPrice] = useState(edit?.price !== undefined ? String(edit.price) : "");
  const [priceCurrency, setPriceCurrency] = useState<Currency>(
    edit?.priceCurrency ?? defaultRecordCurrency(profile.displayCurrency),
  );
  const [date, setDate] = useState(edit?.date ?? today());
  const [note, setNote] = useState(edit?.name ?? "");
  const [err, setErr] = useState("");
  const money = kind !== "" && isMoneyKind(kind);
  const unit = kind === "" ? "" : money ? currency : kind === "Crypto" ? coin : "g";
  const close = () => setSaveSheet(null);
  const pickKind = (k: HoldingKind) => {
    setKind(k);
    // Money keeps 2 decimals; trim a longer gram/coin amount when switching.
    if (isMoneyKind(k)) setAmount((a) => a.replace(/^(\d+\.\d{0,2}).*$/, "$1"));
  };
  const save = async () => {
    const q = Number(amount.replace(/\.$/, ""));
    const p = price === "" ? undefined : Number(price.replace(/\.$/, ""));
    const message = !kind
      ? "Pick what you saved."
      : !(q > 0)
        ? "Enter an amount above zero."
        : kind === "Crypto" && !/^[A-Z0-9]{1,10}$/.test(coin)
          ? "Enter the coin's symbol, for example BTC."
          : p !== undefined && !(p > 0)
            ? "Leave the purchase price empty or enter an amount above zero."
            : date > today()
              ? "Pick today or an earlier date."
              : "";
    setErr(message && t(message));
    if (message || !kind) return;
    const holding: Holding = {
      id: edit?.id ?? uid(),
      kind,
      quantity: q,
      unit,
      name: note.trim() || t(kind),
      date,
      ...(!money && p !== undefined ? { price: p, priceCurrency } : {}),
    };
    const prev = holdings;
    if (
      !(await setHoldings(
        edit ? holdings.map((x) => (x.id === edit.id ? holding : x)) : [holding, ...holdings],
      ))
    )
      return;
    toast(
      `${t(edit ? "Saving updated." : "Saving added.")} · ${holdingText(holding)} · ${t(kind)}`,
      () => setHoldings(prev),
    );
    close();
  };
  const field = "h-13 rounded-tile border border-line bg-field px-4 font-sans w-full min-w-0";
  return (
    <Sheet title={edit ? t("Edit saving") : t("Add saving")} onClose={close}>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="grid gap-2 content-start">
          <p className="f-ui m-0">{t("What did you save?")}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] gap-2">
            {HOLD_KINDS.map(([k, I]) => (
              <Tile
                dense
                key={k}
                on={kind === k}
                onClick={() => pickKind(k)}
                icon={<I size={22} />}
                label={t(k)}
              />
            ))}
          </div>
          <p className="m-0 text-sm text-soft">
            {t("Not linked to a goal. Saved as you enter it, not at today's price.")}
          </p>
        </div>
        <div className="grid gap-3 content-start">
          <label className="f-ui grid gap-1">
            {kind === "Gold" || kind === "Silver"
              ? t("Amount (grams)")
              : kind === "Crypto"
                ? t("Amount (coins)")
                : `${t("Amount")} (${curLabelIn(currency)})`}
            <input
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                const n = clean(e.target.value, money ? 2 : 8);
                if (n !== null) setAmount(n);
              }}
              onKeyDown={(e) => e.key === "Enter" && void save()}
              aria-invalid={!!err}
              aria-describedby={err ? "saving-err" : undefined}
              className={`f-num text-3xl text-right ${field} h-16`}
            />
          </label>
          {money && (
            <RecordCurrencyPicker
              full
              label={t("Currency")}
              value={currency}
              onChange={setCurrency}
            />
          )}
          {kind === "Crypto" && (
            <label className="f-ui grid gap-1">
              {t("Coin")}
              <input
                value={coin}
                placeholder="BTC"
                maxLength={10}
                autoCapitalize="characters"
                onChange={(e) => setCoin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                className={field}
              />
            </label>
          )}
          {kind !== "" && !money && (
            <fieldset className="grid gap-2 border-0 p-0 m-0">
              <legend className="f-ui mb-1">
                {t("Purchase price per {u} (optional)", { u: unit || t("coin") })}
              </legend>
              <input
                inputMode="decimal"
                placeholder="0"
                aria-label={t("Purchase price per {u} (optional)", { u: unit || t("coin") })}
                aria-describedby="saving-price-note"
                value={price}
                onChange={(e) => {
                  const n = clean(e.target.value, 2);
                  if (n !== null) setPrice(n);
                }}
                className={`f-num text-right ${field}`}
              />
              <Segmented
                full
                label={t("Purchase price currency")}
                value={priceCurrency}
                onChange={setPriceCurrency}
                options={(["TRY", "USD", "EUR"] as const).map((c) => [c, curLabelIn(c)])}
              />
              <p id="saving-price-note" className="m-0 text-sm text-soft">
                {t("Just a reminder for you; nothing is calculated from it.")}
              </p>
            </fieldset>
          )}
          <label className="f-ui grid gap-1">
            {t("Date")}
            <input
              type="date"
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value || today())}
              className={field}
            />
          </label>
          <label className="f-ui grid gap-1">
            {t("Note (optional)")}
            <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
          </label>
          {err && (
            <p id="saving-err" role="alert" className="m-0 text-sm text-danger">
              {err}
            </p>
          )}
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-2 justify-end">
          <Button onClick={close}>{t("Cancel")}</Button>
          <Button variant="sun" big onClick={save}>
            {t("Save")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
