import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, habitSignals, purchaseEntry, today } from "../src/store.ts";

const profile = {
  email: "",
  income: 1,
  savings: 2,
  habits: [0, 0, 2, 2],
  onboarded: true,
  currency: "symbol",
};
const purchase = {
  name: "Headphones",
  price: 2500,
  cat: "Shopping",
  reasons: ["need"],
  feeling: "Calm",
  own: false,
  wait: "3d",
};
const entry = (type, amount) => ({
  id: type,
  type,
  amount,
  cat: "Other",
  name: type,
  date: today(),
});

test("budget fit follows what is left this month", () => {
  const base = analyze(purchase, profile).budget;
  const tight = analyze(purchase, profile, undefined, [
    entry("income", 10000),
    entry("expense", 7000),
  ]);
  assert.ok(tight.budget < base);
  assert.equal(tight.income, 10000);
  const broke = analyze(purchase, profile, undefined, [
    entry("income", 5000),
    entry("expense", 6000),
  ]);
  assert.equal(broke.budget, 0);
  assert.equal(broke.fit, broke.budget + broke.need + 50 - broke.goalImpact - broke.impulse);
});

test("habits raise impulse only with a matching signal", () => {
  assert.deepEqual(habitSignals(purchase, profile), []);
  const sale = { ...purchase, reasons: ["sale"], wait: "24h" };
  assert.equal(habitSignals(sale, profile).length, 2);
  assert.equal(
    analyze(sale, profile).impulse - analyze(sale, { ...profile, habits: [] }).impulse,
    6,
  );
});

test("a bought purchase becomes an expense entry", () => {
  const e = purchaseEntry(purchase);
  assert.equal(e.type, "expense");
  assert.equal(e.amount, 2500);
  assert.equal(e.cat, "Shopping");
  assert.equal(e.date, today());
});
