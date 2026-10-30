import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENCIES,
  convertAmount,
  convertMinor,
  currencyName,
  formatMoney,
  midRate,
  parseAmount,
  rateAgeDays,
  subtotalsByCurrency,
  toMinorUnits,
  totalIn,
  validateRateSnapshot,
} from "../src/lib/currency.ts";

// Values from TCMB bulletin 2026/166 (04.09.2026), kurlar/202609/04092026.xml:
// USD ForexBuying 48.2326 / ForexSelling 48.3195, EUR 56.0571 / 56.1581,
// EUR CrossRateOther 1.1622. Expected results below were computed independently
// with exact decimal arithmetic (midpoints 48.27605 and 56.1076, half-up to cents).
const NOW = new Date("2026-09-07T12:00:00Z");
const FIXTURE = Object.freeze({
  source: "TCMB",
  bulletin: "2026/166",
  date: "2026-09-04",
  fetchedAt: "2026-09-04T13:00:00Z",
  rates: Object.freeze({
    USD: Object.freeze({ buying: "48.2326", selling: "48.3195" }),
    EUR: Object.freeze({ buying: "56.0571", selling: "56.1581" }),
  }),
  eurUsd: "1.1622",
});
const snapshot = (changes = {}) => structuredClone({ ...FIXTURE, ...changes });
function valid(input = FIXTURE) {
  const result = validateRateSnapshot(input, NOW);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.rates;
}
const RATES = valid();
const amountOf = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.amount;
};

test("the verified TCMB fixture validates and exposes exact midpoints", () => {
  assert.equal(midRate("USD", RATES), "48.27605");
  assert.equal(midRate("EUR", RATES), "56.1076");
  assert.equal(midRate("TRY", RATES), "1");
  assert.equal(RATES.snapshot.bulletin, "2026/166");
  assert.equal(RATES.snapshot.date, "2026-09-04");
  assert.equal(rateAgeDays(RATES, NOW), 3);
  assert.ok(Object.isFrozen(RATES.snapshot) && Object.isFrozen(RATES.snapshot.rates.USD));
  assert.deepEqual(CURRENCIES, ["TRY", "USD", "EUR"]);
});

test("all six conversion directions use the midpoint and round half away from zero", () => {
  assert.equal(amountOf(convertAmount(100, "USD", "TRY", RATES)), 4827.61);
  assert.equal(amountOf(convertAmount(1000, "TRY", "USD", RATES)), 20.71);
  assert.equal(amountOf(convertAmount(100, "EUR", "TRY", RATES)), 5610.76);
  assert.equal(amountOf(convertAmount(1000, "TRY", "EUR", RATES)), 17.82);
  assert.equal(amountOf(convertAmount(100, "USD", "EUR", RATES)), 86.04);
  assert.equal(amountOf(convertAmount(100, "EUR", "USD", RATES)), 116.22);
  const result = convertAmount(129.95, "USD", "TRY", RATES);
  assert.deepEqual(result, {
    ok: true,
    amount: 6273.47,
    minor: 627347,
    currency: "TRY",
    approximate: true,
  });
  assert.equal(amountOf(convertAmount(-100, "USD", "TRY", RATES)), -4827.61);
});

test("same-currency conversion and zero need no rate and are exact", () => {
  for (const currency of CURRENCIES) {
    assert.deepEqual(convertAmount(129.95, currency, currency, null), {
      ok: true,
      amount: 129.95,
      minor: 12995,
      currency,
      approximate: false,
    });
  }
  assert.equal(amountOf(convertAmount(0, "USD", "TRY", null)), 0);
});

test("round trips: USD→TRY→USD is exact; TRY→USD→TRY stays within half a cent's worth", () => {
  for (const amount of [0.01, 1, 15.99, 129.95, 2499.9, 99999999.99]) {
    for (const foreign of ["USD", "EUR"]) {
      const there = amountOf(convertAmount(amount, foreign, "TRY", RATES));
      assert.equal(amountOf(convertAmount(there, "TRY", foreign, RATES)), amount);
    }
  }
  // TRY has finer steps than 1 cent of USD, so TRY → USD can lose up to half a cent.
  const back = amountOf(
    convertAmount(amountOf(convertAmount(1000, "TRY", "USD", RATES)), "USD", "TRY", RATES),
  );
  assert.equal(back, 999.8);
  assert.ok(Math.abs(back - 1000) <= 48.27605 / 200);
  // USD ↔ EUR through TRY agrees with TCMB's own cross rate.
  assert.ok(Math.abs(amountOf(convertAmount(1, "EUR", "USD", RATES)) - 1.1622) <= 0.005);
});

test("missing or forged rates fail explicitly instead of inventing a rate", () => {
  for (const rates of [null, undefined, { snapshot: FIXTURE }]) {
    assert.deepEqual(convertAmount(100, "USD", "TRY", rates), {
      ok: false,
      reason: "missing-rate",
    });
    assert.deepEqual(convertAmount(100, "TRY", "EUR", rates), {
      ok: false,
      reason: "missing-rate",
    });
  }
  assert.deepEqual(convertAmount(100, "GBP", "TRY", RATES), {
    ok: false,
    reason: "invalid-currency",
  });
});

test("zero, negative and malformed rates are rejected", () => {
  const cases = [
    ["0", "48.3195"],
    ["0.0000", "48.3195"],
    ["-48.2326", "48.3195"],
    [48.2326, "48.3195"],
    ["48,2326", "48.3195"],
    ["", "48.3195"],
    ["48.2326", "NaN"],
    ["48.2326", "Infinity"],
    ["1e2", "48.3195"],
    ["48.23261234", "48.3195"],
  ];
  for (const [buying, selling] of cases) {
    const input = snapshot();
    input.rates.USD = { buying, selling };
    delete input.eurUsd;
    const result = validateRateSnapshot(input, NOW);
    assert.equal(result.ok, false, `${buying}/${selling}`);
    assert.match(result.errors.join(" "), /USD/);
  }
});

test("invalid or incomplete snapshots are rejected with reasons", () => {
  const corruptions = [
    [null, /object/],
    [[], /object/],
    ["rates", /object/],
    [snapshot({ source: "ECB" }), /Source/],
    [snapshot({ bulletin: undefined }), /Bulletin/],
    [snapshot({ bulletin: "166" }), /Bulletin/],
    [snapshot({ date: "04.09.2026" }), /date/],
    [snapshot({ date: "2026-02-30" }), /date/],
    [snapshot({ date: "2026-09-12" }), /future/],
    [snapshot({ fetchedAt: "yesterday" }), /fetchedAt/],
    [snapshot({ rates: undefined }), /USD rate is missing/],
    [snapshot({ rates: { USD: FIXTURE.rates.USD } }), /EUR rate is missing/],
    [snapshot({ rates: { EUR: FIXTURE.rates.EUR } }), /USD rate is missing/],
    [
      snapshot({ rates: { ...FIXTURE.rates, USD: { buying: "48.3195", selling: "48.2326" } } }),
      /below the buying/,
    ],
    [
      snapshot({ rates: { ...FIXTURE.rates, USD: { buying: "40.0000", selling: "48.3195" } } }),
      /spread/,
    ],
    [snapshot({ eurUsd: "1.3000" }), /cross rate/],
    [snapshot({ eurUsd: "0" }), /eurUsd/],
  ];
  for (const [input, message] of corruptions) {
    const result = validateRateSnapshot(input, NOW);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.match(result.errors.join(" "), message);
  }
  // Optional metadata may be absent; unrelated extra currencies are ignored.
  const minimal = snapshot({ fetchedAt: undefined, eurUsd: undefined });
  delete minimal.fetchedAt;
  delete minimal.eurUsd;
  minimal.rates.GBP = { buying: "64.1", selling: "64.4" };
  assert.equal(validateRateSnapshot(minimal, NOW).ok, true);
});

test("validation never mutates its input", () => {
  const input = snapshot();
  const before = structuredClone(input);
  valid(input);
  assert.deepEqual(input, before);
});

test("mixed-currency totals sum each currency exactly, convert once and never mix without rates", () => {
  const items = Object.freeze([
    Object.freeze({ amount: 1000, currency: "TRY" }),
    Object.freeze({ amount: 60, currency: "USD" }),
    Object.freeze({ amount: 40, currency: "USD" }),
    Object.freeze({ amount: 50, currency: "EUR" }),
  ]);
  const sums = subtotalsByCurrency(items);
  assert.deepEqual(sums.subtotals, { TRY: 1000, USD: 100, EUR: 50 });
  assert.equal(amountOf(totalIn(items, "TRY", RATES)), 8632.99);
  assert.equal(amountOf(totalIn(items, "USD", RATES)), 178.83);
  assert.equal(amountOf(totalIn(items, "EUR", RATES)), 153.86);
  assert.equal(totalIn(items, "TRY", RATES).approximate, true);

  const offline = totalIn(items, "TRY", null);
  assert.equal(offline.ok, false);
  assert.equal(offline.reason, "missing-rate");
  assert.deepEqual(offline.subtotals, { TRY: 1000, USD: 100, EUR: 50 });

  // Single-currency data needs no rates at all, as for every existing (TRY) record.
  const lira = [
    { amount: 32000, currency: "TRY" },
    { amount: 129.95, currency: "TRY" },
  ];
  assert.deepEqual(totalIn(lira, "TRY", null), {
    ok: true,
    amount: 32129.95,
    minor: 3212995,
    currency: "TRY",
    approximate: false,
    subtotals: { TRY: 32129.95 },
  });
  assert.deepEqual(totalIn([], "USD", null).amount, 0);

  // Three 0.01 USD items convert as 0.03 USD (1.45 TRY), not 3 × 0.48.
  const cents = Array.from({ length: 3 }, () => ({ amount: 0.01, currency: "USD" }));
  assert.equal(amountOf(totalIn(cents, "TRY", RATES)), 1.45);
});

test("totals reject invalid items and report which one", () => {
  assert.deepEqual(
    subtotalsByCurrency([
      { amount: 1, currency: "TRY" },
      { amount: 1.005, currency: "TRY" },
    ]),
    {
      ok: false,
      reason: "invalid-amount",
      index: 1,
    },
  );
  assert.deepEqual(subtotalsByCurrency([{ amount: 1, currency: "try" }]), {
    ok: false,
    reason: "invalid-currency",
    index: 0,
  });
  assert.equal(totalIn([{ amount: Number.NaN, currency: "USD" }], "TRY", RATES).ok, false);
});

test("decimal precision: kuruş are kept, binary noise is absorbed, extra decimals are refused", () => {
  assert.equal(toMinorUnits(0.1 + 0.2), 30);
  assert.equal(toMinorUnits(129.95), 12995);
  assert.equal(toMinorUnits(-0), 0);
  assert.equal(toMinorUnits(1.005), null);
  assert.equal(toMinorUnits(Number.NaN), null);
  assert.equal(toMinorUnits(Infinity), null);
  assert.equal(
    subtotalsByCurrency([
      { amount: 0.1, currency: "TRY" },
      { amount: 0.2, currency: "TRY" },
    ]).subtotals.TRY,
    0.3,
  );
  assert.equal(amountOf(convertAmount(0.01, "USD", "TRY", RATES)), 0.48);
  // Below half a cent the converted value rounds to zero (documented limitation).
  assert.equal(amountOf(convertAmount(0.01, "TRY", "USD", RATES)), 0);
});

test("large amounts stay exact up to the database limit and fail beyond safe integers", () => {
  const max = 999999999999.99;
  assert.equal(toMinorUnits(max), 99999999999999);
  assert.equal(amountOf(convertAmount(max, "USD", "TRY", RATES)), 48276049999999.52);
  assert.equal(amountOf(convertAmount(max, "EUR", "TRY", RATES)), 56107599999999.44);
  assert.equal(amountOf(convertAmount(max, "TRY", "USD", RATES)), 20714205076.84);
  assert.deepEqual(convertAmount(1e13, "USD", "TRY", RATES), {
    ok: false,
    reason: "invalid-amount",
  });
  assert.deepEqual(convertMinor(Number.MAX_SAFE_INTEGER, "USD", "TRY", RATES), {
    ok: false,
    reason: "invalid-amount",
  });
  const extreme = valid(
    snapshot({
      eurUsd: undefined,
      rates: { USD: { buying: "9999999", selling: "9999999" }, EUR: FIXTURE.rates.EUR },
    }),
  );
  assert.deepEqual(convertAmount(max, "USD", "TRY", extreme), {
    ok: false,
    reason: "out-of-range",
  });
});

test("Turkish formatting uses Turkish separators for every currency", () => {
  assert.equal(formatMoney(1234.5, "TRY", "tr"), "₺1.234,50");
  assert.equal(formatMoney(1234.5, "USD", "tr"), "$1.234,50");
  assert.equal(formatMoney(2500, "EUR", "tr"), "€2.500");
  assert.equal(formatMoney(1234.56, "TRY", "tr", { display: "code" }), "1.234,56 TRY");
  assert.equal(formatMoney(86.04, "EUR", "tr", { approximate: true }), "≈ €86,04");
  assert.equal(formatMoney(-12.5, "TRY", "tr"), "−₺12,50");
  assert.equal(formatMoney(2499.5, "TRY", "tr", { fraction: "none" }), "₺2.500");
  assert.equal(formatMoney(15, "USD", "tr", { fraction: "always" }), "$15,00");
  assert.equal(formatMoney(999999999999.99, "TRY", "tr"), "₺999.999.999.999,99");
  assert.equal(currencyName("USD", "tr"), "ABD doları");
});

test("English formatting uses English separators for every currency", () => {
  assert.equal(formatMoney(1234.5, "TRY", "en"), "₺1,234.50");
  assert.equal(formatMoney(1234.5, "USD", "en"), "$1,234.50");
  assert.equal(formatMoney(2500, "EUR", "en", { display: "code" }), "2,500 EUR");
  assert.equal(formatMoney(4827.61, "TRY", "en", { approximate: true }), "≈ ₺4,827.61");
  assert.equal(formatMoney(-0.001, "USD", "en"), "$0");
  assert.equal(formatMoney(Number.NaN, "USD", "en"), "");
  assert.equal(currencyName("EUR", "en"), "euro");
});

test("amount parsing accepts clear input and refuses ambiguous input instead of guessing", () => {
  const ok = (input, lang, minor) =>
    assert.deepEqual(parseAmount(input, lang), { ok: true, amount: minor / 100, minor }, input);
  const no = (input, lang, reason) =>
    assert.deepEqual(parseAmount(input, lang), { ok: false, reason }, `${lang} ${input}`);

  for (const lang of ["tr", "en"]) {
    ok("2500", lang, 250000);
    ok(" 007 ", lang, 700);
    ok("12,5", lang, 1250);
    ok("12.50", lang, 1250);
    ok("129,95", lang, 12995);
    ok("999999999999,99", lang, 99999999999999);
    // The 1.250 problem: thousands in one convention, a third decimal in the other.
    no("1.250", lang, "ambiguous");
    no("1,250", lang, "ambiguous");
    no("12.345", lang, "ambiguous");
    no("0.250", lang, "too-many-decimals");
    no("1234.567", lang, "too-many-decimals");
    no("", lang, "empty");
    no("   ", lang, "empty");
    no("-5", lang, "invalid");
    no("+5", lang, "invalid");
    no("5 TL", lang, "invalid");
    no("$5", lang, "invalid");
    no("1e3", lang, "invalid");
    no(".5", lang, "invalid");
    no("5.", lang, "invalid");
    no("1 250", lang, "invalid");
    no("0", lang, "zero");
    no("0,00", lang, "zero");
    no("1000000000000", lang, "too-large");
  }
  ok("1.234,56", "tr", 123456);
  ok("1.234.567", "tr", 123456700);
  no("1,234.56", "tr", "wrong-separators");
  no("1,234,567", "tr", "wrong-separators");
  no("1.234.56", "tr", "invalid");
  no("1.234,567", "tr", "too-many-decimals");
  ok("1,234.56", "en", 123456);
  ok("1,234,567", "en", 123456700);
  no("1.234,56", "en", "wrong-separators");
  no("1.234.567", "en", "wrong-separators");
  no("12,34.5", "en", "invalid");
});
