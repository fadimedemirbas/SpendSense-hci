import assert from "node:assert/strict";
import test from "node:test";
import { formatMonth, monthBounds, monthOf, shiftMonth } from "../src/lib/months.ts";

test("months are YYYY-MM keys and move across year boundaries", () => {
  assert.equal(monthOf("2026-11-01"), "2026-11");
  assert.equal(shiftMonth("2026-11", -1), "2026-10");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
  assert.equal(shiftMonth("2026-03", -14), "2025-01");
  assert.equal(shiftMonth("2026-03", 0), "2026-03");
});

test("browsable months run from the oldest record to the current month", () => {
  assert.deepEqual(monthBounds([], "2026-11-01"), { earliest: "2026-11", latest: "2026-11" });
  assert.deepEqual(monthBounds(["2026-09-15", "2025-12-31", "2026-11-01"], "2026-11-01"), {
    earliest: "2025-12",
    latest: "2026-11",
  });
});

test("month names follow the UI language", () => {
  assert.equal(formatMonth("2026-11", "en"), "November 2026");
  assert.equal(formatMonth("2026-11", "tr"), "Kasım 2026");
  assert.equal(formatMonth("2026-01", "tr"), "Ocak 2026");
});
