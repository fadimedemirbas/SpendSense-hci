// Multi-currency utilities (TRY, USD, EUR). Pure functions only: nothing here
// reads storage, fetches rates or mutates the records it is given.
//
// Conversion model
// - Rates come from one validated TCMB snapshot: the midpoint of ForexBuying and
//   ForexSelling, per 1 unit of foreign currency. The midpoint is derived by
//   SpendSense for approximate comparisons; it is not a rate TCMB publishes.
// - TRY is the base. USD ↔ EUR goes through TRY with the same snapshot.
// - Amounts are handled in minor units (kuruş/cents) as safe integers and every
//   conversion is exact rational arithmetic (BigInt) with ONE rounding at the end:
//   half away from zero, to the nearest minor unit.
// - Nothing falls back to an invented rate: a missing or invalid snapshot is an
//   explicit failure result. Same-currency amounts and zero need no rate.

export const CURRENCIES = ["TRY", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export type ForeignCurrency = Exclude<Currency, "TRY">;
export type Lang = "en" | "tr";

export const isCurrency = (value: unknown): value is Currency =>
  typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);

/** An original amount in its own currency (major units, e.g. 129.95). */
export interface Money {
  readonly amount: number;
  readonly currency: Currency;
}

/** Largest amount the database accepts (numeric(14,2) with the existing checks). */
export const MAX_AMOUNT = 999_999_999_999.99;
const MAX_MINOR = 99_999_999_999_999;

/* ---------- minor units ---------- */

/**
 * Converts a major-unit amount to minor units, or null when it is not a finite
 * number with at most two decimals within ±MAX_AMOUNT. Tiny binary noise such as
 * 0.1 + 0.2 is accepted as 0.30; a real third decimal (1.005) is rejected.
 */
export function toMinorUnits(amount: number): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (Math.abs(amount) > MAX_AMOUNT) return null;
  const scaled = amount * 100;
  const minor = Math.round(scaled);
  const tolerance = Math.max(1e-6, Math.abs(scaled) * 8 * Number.EPSILON);
  if (Math.abs(scaled - minor) > tolerance) return null;
  return minor === 0 ? 0 : minor; // never -0
}

export const fromMinorUnits = (minor: number) => minor / 100;

/* ---------- exchange-rate snapshots ---------- */

/** One TCMB quote per 1 unit of currency, as the decimal strings TCMB publishes. */
export interface RateQuote {
  /** TCMB ForexBuying (döviz alış), e.g. "48.2326". */
  readonly buying: string;
  /** TCMB ForexSelling (döviz satış), e.g. "48.3195". */
  readonly selling: string;
}

/** The shape the future /api/rates endpoint returns and the app caches. */
export interface RateSnapshot {
  readonly source: "TCMB";
  /** TCMB bulletin number (Bulten_No), e.g. "2026/166". */
  readonly bulletin: string;
  /** Publication date of the bulletin (YYYY-MM-DD), not the date it was fetched. */
  readonly date: string;
  /** When SpendSense fetched it (ISO timestamp). Optional metadata. */
  readonly fetchedAt?: string;
  readonly rates: Readonly<Record<ForeignCurrency, RateQuote>>;
  /** Optional TCMB CrossRateOther for EUR (USD per 1 EUR), used as a consistency check. */
  readonly eurUsd?: string;
}

/** A snapshot that passed validateRateSnapshot(). Only this module can create one. */
export interface ValidRates {
  readonly snapshot: RateSnapshot;
}
export type RatesValidation =
  | { readonly ok: true; readonly rates: ValidRates }
  | { readonly ok: false; readonly errors: readonly string[] };

// Rates as integers in millionths. A currency's "weight" is buying + selling,
// i.e. twice the midpoint, so midpoints never need a rounding step.
const RATE_SCALE = 1_000_000n;
const TRY_WEIGHT = 2n * RATE_SCALE;
const weights = new WeakMap<ValidRates, Readonly<Record<Currency, bigint>>>();

/** TCMB spreads are well under 1%; a wider one points to a malformed response. */
const MAX_SPREAD = 0.05;
/** Tolerance between the TRY-based EUR/USD and TCMB's own cross rate. */
const MAX_CROSS_DEVIATION = 0.005;

const DECIMAL = /^(\d{1,7})(?:\.(\d{1,6}))?$/;
function micro(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = DECIMAL.exec(value);
  if (!match) return null;
  const parsed = BigInt(match[1]) * RATE_SCALE + BigInt((match[2] ?? "").padEnd(6, "0"));
  return parsed > 0n ? parsed : null;
}
function calendarDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
const freeze = <T extends object>(value: T): T => Object.freeze(value);

/**
 * Strictly validates an untrusted snapshot (network response or cache).
 * Returns every problem found instead of a partially usable result.
 * `now` decides what counts as a future publication date (one day of slack for time zones).
 */
export function validateRateSnapshot(input: unknown, now: Date = new Date()): RatesValidation {
  const errors: string[] = [];
  const value = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return { ok: false, errors: ["Snapshot must be an object."] };
  if (value.source !== "TCMB") errors.push("Source must be TCMB.");
  if (typeof value.bulletin !== "string" || !/^\d{4}\/\d{1,4}$/.test(value.bulletin))
    errors.push("Bulletin number is missing or malformed.");
  const published = calendarDate(value.date);
  if (!published) errors.push("Publication date must be a valid YYYY-MM-DD date.");
  else if (published.getTime() > now.getTime() + 864e5)
    errors.push("Publication date is in the future.");
  if (value.fetchedAt !== undefined && Number.isNaN(Date.parse(String(value.fetchedAt))))
    errors.push("fetchedAt must be an ISO timestamp.");

  const rates = (
    typeof value.rates === "object" && value.rates !== null ? value.rates : {}
  ) as Record<string, unknown>;
  const weight: Partial<Record<Currency, bigint>> = { TRY: TRY_WEIGHT };
  const quotes: Partial<Record<ForeignCurrency, RateQuote>> = {};
  for (const code of ["USD", "EUR"] as const) {
    const quote = rates[code] as Record<string, unknown> | undefined;
    if (typeof quote !== "object" || quote === null) {
      errors.push(`${code} rate is missing.`);
      continue;
    }
    const buying = micro(quote.buying);
    const selling = micro(quote.selling);
    if (buying === null || selling === null) {
      errors.push(`${code} buying and selling must be positive decimal strings.`);
      continue;
    }
    if (selling < buying) errors.push(`${code} selling rate is below the buying rate.`);
    else if (Number(selling - buying) / Number(buying) > MAX_SPREAD)
      errors.push(`${code} buying/selling spread is implausibly wide.`);
    weight[code] = buying + selling;
    quotes[code] = freeze({ buying: quote.buying as string, selling: quote.selling as string });
  }
  if (value.eurUsd !== undefined) {
    const cross = micro(value.eurUsd);
    if (cross === null) errors.push("eurUsd must be a positive decimal string.");
    else if (weight.EUR && weight.USD) {
      const derived = Number(weight.EUR) / Number(weight.USD);
      const published = Number(cross) / Number(RATE_SCALE);
      if (Math.abs(derived - published) / published > MAX_CROSS_DEVIATION)
        errors.push("EUR/USD through TRY disagrees with TCMB's cross rate.");
    }
  }
  if (errors.length) return { ok: false, errors };

  const snapshot: RateSnapshot = freeze({
    source: "TCMB",
    bulletin: value.bulletin as string,
    date: value.date as string,
    ...(value.fetchedAt !== undefined ? { fetchedAt: String(value.fetchedAt) } : {}),
    rates: freeze(quotes as Record<ForeignCurrency, RateQuote>),
    ...(value.eurUsd !== undefined ? { eurUsd: value.eurUsd as string } : {}),
  });
  const valid: ValidRates = freeze({ snapshot });
  weights.set(valid, freeze(weight as Record<Currency, bigint>));
  return { ok: true, rates: valid };
}

function weightsOf(rates: ValidRates | null | undefined) {
  return rates ? weights.get(rates) : undefined;
}

/** The midpoint TRY value of 1 unit, as an exact decimal string ("48.27605"). */
export function midRate(currency: Currency, rates: ValidRates): string | null {
  const weight = weightsOf(rates)?.[currency];
  if (weight === undefined) return null;
  // weight is 2 × rate in millionths, so weight × 5 is the rate in ten-millionths.
  const scaled = (weight * 5n).toString().padStart(8, "0");
  const whole = scaled.slice(0, -7);
  const fraction = scaled.slice(-7).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Whole calendar days between the bulletin date and `now` (UTC dates). */
export function rateAgeDays(rates: ValidRates, now: Date = new Date()): number {
  const published = Date.parse(`${rates.snapshot.date}T00:00:00Z`);
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((today - published) / 864e5));
}

/* ---------- conversion ---------- */

export type ConversionFailure =
  | "invalid-amount"
  | "invalid-currency"
  | "missing-rate"
  | "out-of-range";
export type Converted =
  | {
      readonly ok: true;
      readonly amount: number;
      readonly minor: number;
      readonly currency: Currency;
      /** True when a rate was used (the value is approximate). */
      readonly approximate: boolean;
    }
  | { readonly ok: false; readonly reason: ConversionFailure };

/** Divides with rounding half away from zero. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const twice = (remainder < 0n ? -remainder : remainder) * 2n;
  if (twice < denominator) return quotient;
  return quotient + (numerator < 0n ? -1n : 1n);
}

function converted(minor: bigint, currency: Currency, approximate: boolean): Converted {
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < -BigInt(Number.MAX_SAFE_INTEGER))
    return { ok: false, reason: "out-of-range" };
  const value = Number(minor) || 0;
  return { ok: true, amount: fromMinorUnits(value), minor: value, currency, approximate };
}

/** Converts minor units between currencies with one snapshot and one rounding. */
export function convertMinor(
  minor: number,
  from: Currency,
  to: Currency,
  rates: ValidRates | null | undefined,
): Converted {
  if (!isCurrency(from) || !isCurrency(to)) return { ok: false, reason: "invalid-currency" };
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MINOR)
    return { ok: false, reason: "invalid-amount" };
  if (from === to || minor === 0) return converted(BigInt(minor), to, false);
  const weight = weightsOf(rates);
  if (!weight) return { ok: false, reason: "missing-rate" };
  return converted(divideRounded(BigInt(minor) * weight[from], weight[to]), to, true);
}

/** Converts an amount in major units (e.g. 129.95 USD → TRY). */
export function convertAmount(
  amount: number,
  from: Currency,
  to: Currency,
  rates: ValidRates | null | undefined,
): Converted {
  const minor = toMinorUnits(amount);
  if (minor === null) return { ok: false, reason: "invalid-amount" };
  return convertMinor(minor, from, to, rates);
}

/* ---------- totals ---------- */

export type Subtotals = Readonly<Partial<Record<Currency, number>>>;
export type SubtotalResult =
  | { readonly ok: true; readonly subtotals: Subtotals; readonly minor: Subtotals }
  | {
      readonly ok: false;
      readonly reason: "invalid-amount" | "invalid-currency";
      readonly index: number;
    };

/**
 * Exact per-currency sums (no conversion). Currencies with no items are omitted;
 * the result lists them in CURRENCIES order. Inputs are read, never changed.
 */
export function subtotalsByCurrency(items: readonly Money[]): SubtotalResult {
  const sums: Partial<Record<Currency, bigint>> = {};
  for (let index = 0; index < items.length; index++) {
    const { amount, currency } = items[index];
    if (!isCurrency(currency)) return { ok: false, reason: "invalid-currency", index };
    const minor = toMinorUnits(amount);
    if (minor === null) return { ok: false, reason: "invalid-amount", index };
    sums[currency] = (sums[currency] ?? 0n) + BigInt(minor);
  }
  const subtotals: Partial<Record<Currency, number>> = {};
  const minor: Partial<Record<Currency, number>> = {};
  for (const currency of CURRENCIES) {
    const sum = sums[currency];
    if (sum === undefined) continue;
    if (sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < -BigInt(Number.MAX_SAFE_INTEGER))
      return { ok: false, reason: "invalid-amount", index: -1 };
    minor[currency] = Number(sum) || 0;
    subtotals[currency] = fromMinorUnits(minor[currency]!);
  }
  return { ok: true, subtotals: freeze(subtotals), minor: freeze(minor) };
}

export type TotalResult =
  | {
      readonly ok: true;
      readonly amount: number;
      readonly minor: number;
      readonly currency: Currency;
      readonly approximate: boolean;
      readonly subtotals: Subtotals;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid-amount" | "invalid-currency" | "missing-rate" | "out-of-range";
      /** Present when the inputs were valid, so the UI can show per-currency sums instead. */
      readonly subtotals?: Subtotals;
    };

/**
 * Total of mixed-currency items in `target`. Exact per-currency sums are converted
 * together and rounded once. Without valid rates, mixed currencies are never added:
 * the result fails with "missing-rate" and carries the separate subtotals.
 */
export function totalIn(
  items: readonly Money[],
  target: Currency,
  rates: ValidRates | null | undefined,
): TotalResult {
  if (!isCurrency(target)) return { ok: false, reason: "invalid-currency" };
  const sums = subtotalsByCurrency(items);
  if (!sums.ok) return { ok: false, reason: sums.reason };
  const present = CURRENCIES.filter((c) => sums.minor[c] !== undefined && sums.minor[c] !== 0);
  const approximate = present.some((c) => c !== target);
  if (!approximate) {
    const minor = sums.minor[target] ?? 0;
    return {
      ok: true,
      amount: fromMinorUnits(minor),
      minor,
      currency: target,
      approximate,
      subtotals: sums.subtotals,
    };
  }
  const weight = weightsOf(rates);
  if (!weight) return { ok: false, reason: "missing-rate", subtotals: sums.subtotals };
  let numerator = 0n;
  for (const c of present) numerator += BigInt(sums.minor[c]!) * weight[c];
  const result = converted(divideRounded(numerator, weight[target]), target, true);
  if (!result.ok) return { ok: false, reason: result.reason, subtotals: sums.subtotals };
  return { ...result, approximate: true, subtotals: sums.subtotals };
}

/* ---------- formatting ---------- */

export const CURRENCY_SYMBOL: Readonly<Record<Currency, string>> = freeze({
  TRY: "₺",
  USD: "$",
  EUR: "€",
});
const NAMES: Record<Lang, Record<Currency, string>> = {
  en: { TRY: "Turkish lira", USD: "US dollar", EUR: "euro" },
  tr: { TRY: "Türk lirası", USD: "ABD doları", EUR: "Euro" },
};
/** Full currency name for labels and screen-reader text. */
export const currencyName = (currency: Currency, lang: Lang) => NAMES[lang][currency];

export interface FormatOptions {
  /** "symbol" → ₺1.250, "code" → 1.250 TRY (the existing Profile.currency setting). */
  readonly display?: "symbol" | "code";
  /** Prefix "≈ " for converted values. */
  readonly approximate?: boolean;
  /** "auto": decimals only when there are kuruş/cents (the Decide convention). */
  readonly fraction?: "auto" | "always" | "none";
}

/**
 * Formats with the UI language's separators: tr → 1.234,56 and en → 1,234.56.
 * Rounds half away from zero to cents ("none": to whole units). Returns "" for
 * non-finite input so a bad value is visible instead of printed as a number.
 */
export function formatMoney(
  amount: number,
  currency: Currency,
  lang: Lang,
  { display = "symbol", approximate = false, fraction = "auto" }: FormatOptions = {},
): string {
  if (!Number.isFinite(amount) || !isCurrency(currency)) return "";
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = fraction === "none" ? Math.round(cents / 100) * 100 : cents;
  const digits = fraction === "always" ? 2 : fraction === "none" || whole % 100 === 0 ? 0 : 2;
  const text = (whole / 100).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = amount < 0 && whole !== 0 ? "−" : "";
  const body = display === "code" ? `${text} ${currency}` : `${CURRENCY_SYMBOL[currency]}${text}`;
  return `${approximate ? "≈ " : ""}${sign}${body}`;
}

/* ---------- parsing ---------- */

export type ParseFailure =
  | "empty"
  | "invalid"
  | "ambiguous"
  | "wrong-separators"
  | "too-many-decimals"
  | "zero"
  | "too-large";
export type ParsedAmount =
  | { readonly ok: true; readonly amount: number; readonly minor: number }
  | { readonly ok: false; readonly reason: ParseFailure };

/**
 * Parsing contract for typed amounts (positive, at most two decimals):
 * - Only digits with "." or ","; no signs, spaces inside, symbols or letters.
 * - One separator followed by 1–2 digits is a decimal mark in either language
 *   ("12,5", "12.50").
 * - One separator followed by exactly 3 digits ("1.250", "1,250") is ambiguous:
 *   thousands in one convention, a third decimal in the other. It is rejected as
 *   "ambiguous" so the UI can ask, never guessed.
 * - Grouped thousands are accepted only in the UI language's convention
 *   (tr "1.234.567" / "1.234,56", en "1,234,567" / "1,234.56"); the other
 *   convention is "wrong-separators".
 * Amounts are built from the digits as integers, never through parseFloat.
 */
export function parseAmount(input: string, lang: Lang): ParsedAmount {
  const text = typeof input === "string" ? input.trim() : "";
  if (text === "") return { ok: false, reason: "empty" };
  if (!/^[\d.,]+$/.test(text) || !/^\d/.test(text) || !/\d$/.test(text))
    return { ok: false, reason: "invalid" };
  const group = lang === "tr" ? "." : ",";
  const decimal = lang === "tr" ? "," : ".";
  const separators = text.replace(/\d/g, "");
  let integer: string;
  let fractionDigits = "";
  const grouped = (value: string, mark: string) =>
    new RegExp(`^[1-9]\\d{0,2}(\\${mark}\\d{3})+$`).test(value);

  if (separators === "") integer = text;
  else if (new Set(separators).size === 1 && separators.length === 1) {
    const [head, tail] = text.split(separators);
    if (tail.length <= 2) [integer, fractionDigits] = [head, tail];
    else if (tail.length === 3 && grouped(text, separators))
      return { ok: false, reason: "ambiguous" };
    else return { ok: false, reason: "too-many-decimals" };
  } else if (new Set(separators).size === 1) {
    // The same mark several times can only be thousands grouping.
    if (separators[0] !== group) return { ok: false, reason: "wrong-separators" };
    if (!grouped(text, group)) return { ok: false, reason: "invalid" };
    integer = text.split(group).join("");
  } else {
    // Both marks: grouping first, one decimal mark last.
    const last = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
    const head = text.slice(0, last);
    const tail = text.slice(last + 1);
    if (text[last] !== decimal || head.includes(decimal))
      return { ok: false, reason: "wrong-separators" };
    if (!grouped(head, group)) return { ok: false, reason: "invalid" };
    if (tail.length > 2) return { ok: false, reason: "too-many-decimals" };
    integer = head.split(group).join("");
    fractionDigits = tail;
  }
  integer = integer.replace(/^0+(?=\d)/, "");
  if (integer.length > 12) return { ok: false, reason: "too-large" };
  const minor = Number(integer) * 100 + Number(fractionDigits.padEnd(2, "0"));
  if (minor === 0) return { ok: false, reason: "zero" };
  if (minor > MAX_MINOR) return { ok: false, reason: "too-large" };
  return { ok: true, amount: fromMinorUnits(minor), minor };
}
