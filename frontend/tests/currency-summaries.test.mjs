import assert from "node:assert/strict";
import test from "node:test";
import { validateRateSnapshot } from "../src/lib/currency.ts";
import { decideContext, decideNeedsRates } from "../src/lib/decideInputs.ts";
import { NO_RATES } from "../src/lib/moneyTotals.ts";
import { averagePriceInTry, monthView, spendingView } from "../src/lib/summaries.ts";
import {
  WorkspaceProtocolError,
  prepareVersionedWorkspaceSave,
} from "../src/lib/workspaceProtocol.ts";
import { emptyWorkspace } from "../src/lib/workspace.ts";
import { analyze, monthTotals, today } from "../src/store.ts";

// 1 USD = ₺40 and 1 EUR = ₺45 (TCMB midpoints of the fixture).
const valid = validateRateSnapshot(
  {
    source: "TCMB",
    bulletin: "2026/166",
    date: "2026-09-04",
    rates: { USD: { buying: "39.9", selling: "40.1" }, EUR: { buying: "44.9", selling: "45.1" } },
  },
  new Date("2026-09-05T09:00:00Z"),
);
assert.ok(valid.ok);
const fresh = { status: "fresh", rates: valid.rates, bulletinDate: "2026-09-04" };
const stale = { ...fresh, status: "stale" };
const DAY = today();
const LAST_YEAR = `${Number(DAY.slice(0, 4)) - 1}${DAY.slice(4)}`;

let n = 0;
const entry = (type, amount, currency = "TRY", cat = "Food", date = DAY) => ({
  id: `e${++n}`,
  type,
  amount,
  currency,
  cat: type === "income" ? "Salary" : cat,
  name: `entry ${n}`,
  date,
});
const deepFreeze = (value) => {
  for (const inner of Object.values(value))
    if (inner && typeof inner === "object") deepFreeze(inner);
  return Object.freeze(value);
};
const snapshot = (value) => JSON.parse(JSON.stringify(value));

// The Insights arithmetic before Phase 5C, kept here as the reference.
function legacyInsights(entries) {
  const m = entries.filter((e) => e.date.slice(0, 7) === DAY.slice(0, 7));
  const exp = m.filter((e) => e.type === "expense");
  const total = exp.reduce((a, b) => a + b.amount, 0) || 1;
  const byCat = Object.entries(
    exp.reduce((g, e) => ((g[e.cat] = (g[e.cat] ?? 0) + e.amount), g), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const inc = m.filter((e) => e.type === "income").reduce((a, b) => a + b.amount, 0);
  return {
    byCat,
    income: inc,
    spent: exp.reduce((a, b) => a + b.amount, 0),
    total,
    max: Math.max(inc, total),
  };
}

const tryMonth = [
  entry("income", 30000),
  entry("income", 0.1),
  entry("expense", 0.2, "TRY", "Food"),
  entry("expense", 1250.5, "TRY", "Bills"),
  entry("expense", 99.99, "TRY", "Food"),
  entry("expense", 400, "TRY", "Fun"),
  entry("expense", 10, "TRY", "Health"),
  entry("expense", 12, "TRY", "Home"),
  entry("expense", 7, "TRY", "Transport"),
  entry("expense", 5000, "TRY", "Rent", LAST_YEAR),
];

test("Home: TRY-only month uses exactly the previous monthTotals arithmetic", () => {
  const entries = deepFreeze(snapshot(tryMonth));
  const before = monthTotals(entries);
  assert.deepEqual(monthView(entries, "TRY", NO_RATES, DAY), {
    kind: "exact",
    currency: "TRY",
    income: before.income,
    spent: before.spent,
  });
  // Rates being present changes nothing when no conversion is needed.
  assert.deepEqual(monthView(entries, "TRY", fresh, DAY), monthView(entries, "TRY", NO_RATES, DAY));
  assert.deepEqual(monthView([], "TRY", NO_RATES, DAY), {
    kind: "exact",
    currency: "TRY",
    income: 0,
    spent: 0,
  });
});

test("Home: mixed month is converted with rates, marked stale, or shown by currency", () => {
  const entries = deepFreeze([
    entry("income", 1000, "USD"),
    entry("expense", 20000),
    entry("expense", 100, "EUR"),
    entry("expense", 999, "USD", "Food", LAST_YEAR), // another month: ignored
  ]);
  const original = snapshot(entries);
  assert.deepEqual(monthView(entries, "TRY", fresh, DAY), {
    kind: "approximate",
    currency: "TRY",
    income: 40000,
    spent: 24500,
    rate: { status: "fresh", bulletinDate: "2026-09-04" },
  });
  const inUsd = monthView(entries, "USD", stale, DAY);
  assert.equal(inUsd.kind, "approximate");
  assert.equal(inUsd.income, 1000);
  assert.equal(inUsd.spent, 612.5);
  assert.equal(inUsd.rate.status, "stale");
  assert.deepEqual(monthView(entries, "TRY", NO_RATES, DAY), {
    kind: "unavailable",
    income: { USD: 1000 },
    spent: { TRY: 20000, EUR: 100 },
  });
  // A TRY-only month shown in USD needs rates too, and never pretends ₺ are $.
  assert.equal(monthView(snapshot(tryMonth), "USD", NO_RATES, DAY).kind, "unavailable");
  assert.deepEqual(snapshot(entries), original);
});

test("Home: the waited-vs-bought comparison is in TRY and hidden without rates", () => {
  const lira = [
    { price: 100, currency: "TRY" },
    { price: 250.5, currency: "TRY" },
  ];
  assert.equal(averagePriceInTry(lira, NO_RATES), (100 + 250.5) / 2);
  assert.equal(averagePriceInTry([], NO_RATES), null);
  const mixed = [
    { price: 100, currency: "TRY" },
    { price: 10, currency: "USD" },
  ];
  assert.equal(averagePriceInTry(mixed, NO_RATES), undefined);
  assert.equal(averagePriceInTry(mixed, fresh), 250);
  assert.equal(averagePriceInTry(mixed, stale), 250);
});

test("Insights: TRY-only charts keep the previous arithmetic exactly", () => {
  for (const entries of [tryMonth, tryMonth.slice(0, 2), [], [entry("expense", 50)]]) {
    const view = spendingView(deepFreeze(snapshot(entries)), "TRY", NO_RATES, DAY);
    assert.deepEqual(view, { kind: "ok", currency: "TRY", rate: null, ...legacyInsights(entries) });
  }
  // Six categories: still the top five, largest first, ties in first-seen order.
  assert.equal(spendingView(tryMonth, "TRY", NO_RATES, DAY).byCat.length, 5);
});

test("Insights: mixed month charts use converted sums; missing rates give no chart", () => {
  const entries = deepFreeze([
    entry("income", 500, "EUR"),
    entry("expense", 1000, "TRY", "Food"),
    entry("expense", 30, "USD", "Food"),
    entry("expense", 50, "EUR", "Fun"),
    entry("expense", 2000, "TRY", "Bills"),
  ]);
  const view = spendingView(entries, "TRY", fresh, DAY);
  assert.deepEqual(view, {
    kind: "ok",
    currency: "TRY",
    rate: { status: "fresh", bulletinDate: "2026-09-04" },
    byCat: [
      ["Fun", 2250],
      ["Food", 2200],
      ["Bills", 2000],
    ],
    income: 22500,
    spent: 6450,
    total: 6450,
    max: 22500,
  });
  assert.equal(spendingView(entries, "TRY", stale, DAY).rate.status, "stale");
  assert.deepEqual(spendingView(entries, "TRY", NO_RATES, DAY), {
    kind: "unavailable",
    income: { EUR: 500 },
    spent: { TRY: 3000, USD: 30, EUR: 50 },
  });
  // Nothing spent: the bars keep the previous "|| 1" scale.
  const incomeOnly = spendingView([entry("income", 100, "USD")], "TRY", fresh, DAY);
  assert.equal(incomeOnly.total, 1);
  assert.equal(incomeOnly.max, 4000);
});

const profile = {
  email: "me@example.com",
  income: 2,
  savings: 3,
  habits: [0, 0, 0, 0],
  onboarded: true,
  currency: "symbol",
  displayCurrency: "TRY",
};
const purchase = (over = {}) => ({
  name: "Headphones",
  price: 2500,
  currency: "TRY",
  cat: "Shopping",
  reasons: ["need"],
  feeling: "Calm",
  own: false,
  wait: "3d",
  ...over,
});
const tryGoal = {
  id: "g",
  name: "Bike",
  target: 10000,
  saved: 2500,
  currency: "TRY",
  status: "Active",
};

test("Decide: TRY-only scoring results are identical to analyze() before 5C", () => {
  const purchases = [
    purchase(),
    purchase({
      price: 129.95,
      reasons: ["sale", "attention", "reward"],
      feeling: "Excited",
      wait: "24h",
    }),
    purchase({
      price: 75000,
      own: true,
      usable: true,
      reasons: ["social"],
      feeling: "Bored",
      wait: "1w",
    }),
    purchase({ price: 0.01, own: true, usable: false, reasons: ["easier", "wanted"] }),
  ];
  const months = [[], tryMonth, [entry("income", 5000), entry("expense", 6000)]];
  const goals = [undefined, tryGoal, { ...tryGoal, saved: 10000 }];
  for (const p of purchases)
    for (const entries of months)
      for (const goal of goals) {
        const before = analyze(p, profile, goal, entries);
        const context = decideContext(p, profile, goal, entries, NO_RATES, DAY);
        assert.ok(context.ok);
        assert.deepEqual(context.analysis, { ...before, goal: before.goal && { ...before.goal } });
        // What recordAnalysis() stores is byte-for-byte the same JSON.
        assert.equal(JSON.stringify(context.analysis), JSON.stringify(before));
        assert.equal(context.price, p.price);
        assert.deepEqual(context.month, monthTotals(entries));
        assert.equal(context.rate, null);
        assert.equal(decideNeedsRates(p, goal ? [goal] : [], entries, DAY), false);
      }
});

test("Decide: foreign amounts are scored on lira copies with one validated snapshot", () => {
  const p = deepFreeze(purchase({ price: 62.5, currency: "USD" })); // ₺2.500
  const goal = deepFreeze({ ...tryGoal, target: 250, saved: 62.5, currency: "USD" });
  const entries = deepFreeze([entry("income", 750, "EUR"), entry("expense", 7000)]);
  assert.equal(decideNeedsRates(p, [goal], entries, DAY), true);
  const context = decideContext(p, profile, goal, entries, fresh, DAY);
  assert.ok(context.ok);
  const lira = analyze(purchase(), profile, { ...tryGoal, target: 10000, saved: 2500 }, [
    { ...entries[0], amount: 33750, currency: "TRY" },
    { ...entries[1] },
  ]);
  assert.deepEqual(context.analysis, lira);
  assert.equal(context.price, 2500);
  assert.deepEqual(context.month, { income: 33750, spent: 7000 });
  assert.deepEqual(context.rate, { status: "fresh", bulletinDate: "2026-09-04" });
  assert.equal(decideContext(p, profile, goal, entries, stale, DAY).rate.status, "stale");
  // Originals keep their amounts and currencies.
  assert.deepEqual([p.price, p.currency, goal.target, goal.currency], [62.5, "USD", 250, "USD"]);
  assert.deepEqual([entries[0].amount, entries[0].currency], [750, "EUR"]);
});

test("Decide: missing rates block only analyses that need them", () => {
  const usd = purchase({ price: 10, currency: "USD" });
  assert.deepEqual(decideContext(usd, profile, undefined, [], NO_RATES, DAY), {
    ok: false,
    reason: "missing-rate",
  });
  const eurGoal = { ...tryGoal, currency: "EUR" };
  assert.equal(decideContext(purchase(), profile, eurGoal, [], NO_RATES, DAY).ok, false);
  assert.equal(decideContext(purchase(), profile, tryGoal, [], NO_RATES, DAY).ok, true);
  // A foreign entry from another month is not read by analyze(), so it never blocks.
  const old = [entry("expense", 50, "USD", "Food", LAST_YEAR), entry("income", 9000)];
  assert.equal(decideNeedsRates(purchase(), [], old, DAY), false);
  const context = decideContext(purchase(), profile, undefined, old, NO_RATES, DAY);
  assert.ok(context.ok);
  assert.deepEqual(context.analysis, analyze(purchase(), profile, undefined, old));
  // A malformed amount is refused instead of being scored.
  assert.deepEqual(
    decideContext(purchase({ price: Number.NaN }), profile, undefined, [], NO_RATES, DAY),
    { ok: false, reason: "invalid-amount" },
  );
});

test("protocol 1 still refuses USD/EUR purchases, decisions and waiting items", () => {
  const previous = emptyWorkspace("me@example.com");
  const usd = purchase({ price: 10, currency: "USD" });
  for (const next of [
    { ...previous, decisions: [{ ...usd, id: "d", decision: "Skip", date: DAY, fit: 50 }] },
    {
      ...previous,
      waiting: [{ ...usd, id: "w", added: DAY, review: DAY, fit: 50 }],
    },
    {
      ...previous,
      analyses: [{ id: "a", purchase: usd, result: {}, createdAt: DAY }],
    },
  ])
    assert.throws(
      () => prepareVersionedWorkspaceSave(previous, next, "owner", 1),
      (error) =>
        error instanceof WorkspaceProtocolError && error.code === "SS_PROTOCOL_UNSUPPORTED",
    );
});
