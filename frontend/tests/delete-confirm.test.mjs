import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIRM_DELETE_KEY,
  createConfirmController,
  readConfirmCategories,
} from "../src/lib/deleteConfirm.ts";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}
const blockedStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

test("the list defaults to empty and survives blocked or bad storage", () => {
  assert.deepEqual(readConfirmCategories(memoryStorage()), []);
  assert.deepEqual(readConfirmCategories(null), []);
  assert.deepEqual(readConfirmCategories(blockedStorage), []);
  assert.deepEqual(readConfirmCategories(memoryStorage({ [CONFIRM_DELETE_KEY]: "{oops" })), []);
  assert.deepEqual(
    readConfirmCategories(
      memoryStorage({
        [CONFIRM_DELETE_KEY]: JSON.stringify(["expense:Food", 3, "bogus", "expense:Food"]),
      }),
    ),
    ["expense:Food"],
  );
});

test("categories are kept per type, saved, and announced", () => {
  const storage = memoryStorage();
  const c = createConfirmController(storage);
  let calls = 0;
  c.subscribe(() => calls++);
  c.add("expense", "Other");
  c.add("income", "Salary");
  c.add("income", "Salary");
  assert.deepEqual(c.getKeys(), ["expense:Other", "income:Salary"]);
  assert.equal(c.needsConfirm("expense", "Other"), true);
  assert.equal(c.needsConfirm("income", "Other"), false);
  c.remove("expense:Other");
  assert.equal(c.needsConfirm("expense", "Other"), false);
  assert.deepEqual(JSON.parse(storage.data.get(CONFIRM_DELETE_KEY)), ["income:Salary"]);
  assert.equal(calls, 4);
  // A new page load reads the same list back.
  assert.deepEqual(createConfirmController(storage).getKeys(), ["income:Salary"]);
});

test("blocked storage still applies the list for this visit", () => {
  const c = createConfirmController(blockedStorage);
  c.add("expense", "Food");
  assert.equal(c.needsConfirm("expense", "Food"), true);
});
