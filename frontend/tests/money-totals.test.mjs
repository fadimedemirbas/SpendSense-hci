import assert from "node:assert/strict";
import test from "node:test";
import { validateRateSnapshot } from "../src/lib/currency.ts";
import {
  canSaveRecordCurrency,
  defaultRecordCurrency,
  recordCurrencyNote,
  recordCurrencyOptions,
} from "../src/lib/displayCurrency.ts";
import {
  NO_RATES,
  amountUnit,
  entriesInMonth,
  formatBulletinDate,
  formatWholeAmount,
  goalEquivalent,
  goalProgress,
  goalTargetIdeas,
  needsConversion,
  sumIn,
  summarizeEntries,
} from "../src/lib/moneyTotals.ts";
import {
  WorkspaceProtocolError,
  normalizeLoadedWorkspace,
  prepareVersionedWorkspaceSave,
} from "../src/lib/workspaceProtocol.ts";
import { emptyWorkspace } from "../src/lib/workspace.ts";

// Simple whole-number midpoints: 1 USD = ₺40, 1 EUR = ₺45.
const NOW = new Date("2026-09-05T09:00:00Z");
const valid = validateRateSnapshot(
  {
    source: "TCMB",
    bulletin: "2026/166",
    date: "2026-09-04",
    rates: { USD: { buying: "39.9", selling: "40.1" }, EUR: { buying: "44.9", selling: "45.1" } },
  },
  NOW,
);
assert.ok(valid.ok, "fixture rates must validate");
const fresh = { status: "fresh", rates: valid.rates, bulletinDate: "2026-09-04" };
const stale = { ...fresh, status: "stale" };

const entry = (id, type, amount, currency = "TRY", date = "2026-09-03") => ({
  id,
  type,
  amount,
  currency,
  cat: type === "income" ? "Salary" : "Food",
  name: id,
  date,
});
const deepFreeze = (value) => {
  for (const inner of Object.values(value))
    if (inner && typeof inner === "object") deepFreeze(inner);
  return Object.freeze(value);
};
// The app-wide fmt() in ui.tsx, copied here as the reference for TRY output.
const legacyFmt = (n, mode) => {
  const s = Math.round(Math.abs(n)).toLocaleString("tr-TR");
  return (n < 0 ? "−" : "") + (mode === "symbol" ? "₺" + s : s + " TRY");
};

test("TRY amounts look exactly as before; USD/EUR use their own symbol or code", () => {
  for (const mode of ["symbol", "code"])
    for (const n of [0, 1, 12.5, 999.49, 1250, 1250.5, 1234567])
      assert.equal(formatWholeAmount(n, "TRY", mode), legacyFmt(n, mode), `${n} ${mode}`);
  assert.equal(formatWholeAmount(1250, "USD", "symbol"), "$1.250");
  assert.equal(formatWholeAmount(1250, "EUR", "code"), "1.250 EUR");
  assert.equal(formatWholeAmount(1250, "TRY", "symbol", true), "≈ ₺1.250");
  assert.equal(amountUnit("TRY", "symbol"), "₺");
  assert.equal(amountUnit("USD", "code"), "USD");
  assert.equal(amountUnit("EUR", "symbol"), "€");
});

test("bulletin dates are written in the UI language", () => {
  assert.equal(formatBulletinDate("2026-09-04", "en"), "4 September 2026");
  assert.equal(formatBulletinDate("2026-09-04", "tr"), "4 Eylül 2026");
  assert.equal(formatBulletinDate("not-a-date", "en"), "");
});

test("TRY-only totals are exact and need no exchange rates", () => {
  const items = [
    { amount: 1000.25, currency: "TRY" },
    { amount: 99.75, currency: "TRY" },
  ];
  assert.equal(needsConversion(items, "TRY"), false);
  assert.deepEqual(sumIn(items, "TRY", NO_RATES), { kind: "exact", amount: 1100, currency: "TRY" });
  assert.deepEqual(sumIn([], "TRY", NO_RATES), { kind: "exact", amount: 0, currency: "TRY" });
});

test("mixed currencies are converted with validated rates and marked approximate", () => {
  const items = [
    { amount: 1000, currency: "TRY" },
    { amount: 10, currency: "USD" },
    { amount: 2, currency: "EUR" },
  ];
  assert.equal(needsConversion(items, "TRY"), true);
  assert.deepEqual(sumIn(items, "TRY", fresh), {
    kind: "approximate",
    amount: 1490, // 1000 + 10 × 40 + 2 × 45
    currency: "TRY",
    subtotals: { TRY: 1000, USD: 10, EUR: 2 },
    rate: { status: "fresh", bulletinDate: "2026-09-04" },
  });
  const inUsd = sumIn(items, "USD", fresh);
  assert.equal(inUsd.kind, "approximate");
  assert.equal(inUsd.amount, 37.25); // 1490 / 40, rounded once
  // A TRY-only list shown in USD is converted too.
  assert.equal(sumIn([{ amount: 400, currency: "TRY" }], "USD", fresh).amount, 10);
});

test("stale rates still convert but say so; missing rates never produce a total", () => {
  const items = [
    { amount: 1000, currency: "TRY" },
    { amount: 10, currency: "USD" },
  ];
  const old = sumIn(items, "TRY", stale);
  assert.equal(old.kind, "approximate");
  assert.equal(old.rate.status, "stale");
  for (const view of [
    NO_RATES,
    { status: "unavailable", rates: valid.rates, bulletinDate: "2026-09-04" },
    { status: "fresh", rates: null, bulletinDate: null },
    { status: "fresh", rates: { snapshot: valid.rates.snapshot }, bulletinDate: "2026-09-04" }, // not validated
  ]) {
    const result = sumIn(items, "TRY", view);
    assert.deepEqual(result, { kind: "unavailable", subtotals: { TRY: 1000, USD: 10 } });
    assert.equal("amount" in result, false);
  }
  assert.deepEqual(sumIn([{ amount: Number.NaN, currency: "TRY" }], "TRY", fresh), {
    kind: "invalid",
  });
});

test("legacy records default to TRY and summarize exactly; inputs are never changed", () => {
  const workspace = normalizeLoadedWorkspace({
    profile: {
      email: "me@example.com",
      income: 1,
      savings: 1,
      habits: [],
      onboarded: true,
      currency: "symbol",
    },
    entries: [
      { id: "a", type: "income", amount: 30000, cat: "Salary", name: "a", date: "2026-09-01" },
      { id: "b", type: "expense", amount: 1250.5, cat: "Food", name: "b", date: "2026-09-02" },
      { id: "c", type: "expense", amount: 999, cat: "Food", name: "c", date: "2026-08-30" },
    ],
    goals: [{ id: "g", name: "Bike", target: 10000, saved: 2500, status: "Active" }],
    waiting: [],
    decisions: [],
    analyses: [],
  });
  assert.deepEqual(
    workspace.entries.map((e) => e.currency),
    ["TRY", "TRY", "TRY"],
  );
  assert.equal(workspace.goals[0].currency, "TRY");
  const entries = deepFreeze(workspace.entries);
  const month = entriesInMonth(entries, "2026-09-15");
  assert.deepEqual(
    month.map((e) => e.id),
    ["a", "b"],
  );
  assert.deepEqual(summarizeEntries(month, "TRY", NO_RATES), {
    income: { kind: "exact", amount: 30000, currency: "TRY" },
    spent: { kind: "exact", amount: 1250.5, currency: "TRY" },
    left: { kind: "exact", amount: 28749.5, currency: "TRY" },
  });
  assert.equal(entries[1].amount, 1250.5);
});

test("a mixed month: originals are preserved, totals converted, left rounded once", () => {
  const entries = deepFreeze([
    entry("salary", "income", 1000, "USD"),
    entry("rent", "expense", 20000, "TRY"),
    entry("ticket", "expense", 33.33, "EUR"),
  ]);
  const summary = summarizeEntries(entries, "TRY", fresh);
  assert.equal(summary.income.amount, 40000);
  assert.equal(summary.spent.amount, 21499.85); // 20000 + 33.33 × 45
  assert.equal(summary.left.amount, 18500.15);
  assert.deepEqual(summary.spent.subtotals, { TRY: 20000, EUR: 33.33 });
  const offline = summarizeEntries(entries, "TRY", NO_RATES);
  assert.equal(offline.spent.kind, "unavailable");
  assert.deepEqual(offline.left.subtotals, { TRY: -20000, USD: 1000, EUR: -33.33 });
  // The income side is a single currency different from TRY: still needs rates.
  assert.equal(offline.income.kind, "unavailable");
  assert.deepEqual(
    entries.map((e) => [e.amount, e.currency]),
    [
      [1000, "USD"],
      [20000, "TRY"],
      [33.33, "EUR"],
    ],
  );
});

test("goals: progress in their own currency, conversions only with rates", () => {
  const bike = deepFreeze({
    id: "g",
    name: "Bike",
    target: 500,
    saved: 125,
    currency: "USD",
    status: "Active",
  });
  assert.equal(goalProgress(bike), 25);
  assert.equal(goalProgress({ saved: 10, target: 0 }), 0);
  assert.deepEqual(goalTargetIdeas("TRY"), [5000, 10000, 25000, 50000]);
  assert.deepEqual(goalTargetIdeas("EUR"), [500, 1000, 2500, 5000]);
  assert.equal(goalEquivalent(bike, "USD", NO_RATES), null);
  assert.deepEqual(goalEquivalent(bike, "TRY", NO_RATES), { kind: "unavailable" });
  assert.deepEqual(goalEquivalent(bike, "TRY", stale), {
    kind: "approximate",
    saved: 5000,
    target: 20000,
    currency: "TRY",
    rate: { status: "stale", bulletinDate: "2026-09-04" },
  });
  assert.deepEqual([bike.target, bike.saved, bike.currency], [500, 125, "USD"]);
  const lira = { target: 10000, saved: 2500, currency: "TRY" };
  assert.equal(goalEquivalent(lira, "TRY", fresh), null);
});

test("protocol 1: new records start in TRY and USD/EUR cannot be chosen or saved", () => {
  for (const display of ["TRY", "USD", "EUR"]) assert.equal(defaultRecordCurrency(display), "TRY");
  assert.equal(defaultRecordCurrency("USD", 3), "USD");
  assert.deepEqual(
    recordCurrencyOptions().map((o) => [o.value, o.disabled]),
    [
      ["TRY", false],
      ["USD", true],
      ["EUR", true],
    ],
  );
  assert.equal(canSaveRecordCurrency("EUR"), false);
  assert.match(recordCurrencyNote(), /become available/);
  assert.equal(recordCurrencyNote(3), null);
  // A saved record keeps its currency: every other option is disabled, even on protocol 3.
  assert.deepEqual(
    recordCurrencyOptions(3, "EUR").map((o) => [o.value, o.disabled]),
    [
      ["TRY", true],
      ["USD", true],
      ["EUR", false],
    ],
  );
});

test("saving: TRY entries and goals keep their currency; USD/EUR are refused on protocol 1", () => {
  const previous = emptyWorkspace("me@example.com");
  const tryEntry = entry("e1", "expense", 129.95);
  const tryGoal = {
    id: "g1",
    name: "Bike",
    target: 5000,
    saved: 0,
    currency: "TRY",
    status: "Active",
  };
  const ok = prepareVersionedWorkspaceSave(
    previous,
    { ...previous, entries: [tryEntry], goals: [tryGoal] },
    "owner",
    1,
  );
  assert.equal(ok.payload.schemaVersion, 1);
  assert.deepEqual(ok.payload.entries[0], tryEntry);
  assert.deepEqual(ok.payload.goals[0], tryGoal);
  // Editing keeps the stored currency and amount as entered.
  const edited = { ...tryEntry, amount: 150, name: "Lunch" };
  const after = prepareVersionedWorkspaceSave(
    ok.workspace,
    { ...ok.workspace, entries: [edited] },
    "owner",
    1,
  );
  assert.deepEqual(after.payload.entries[0], edited);
  for (const next of [
    { ...previous, entries: [entry("e2", "income", 100, "USD")] },
    { ...previous, goals: [{ ...tryGoal, currency: "EUR" }] },
  ]) {
    assert.throws(
      () => prepareVersionedWorkspaceSave(previous, next, "owner", 1),
      (error) =>
        error instanceof WorkspaceProtocolError && error.code === "SS_PROTOCOL_UNSUPPORTED",
    );
    assert.equal(
      prepareVersionedWorkspaceSave(previous, next, "owner", 3).payload.schemaVersion,
      3,
    );
  }
});
