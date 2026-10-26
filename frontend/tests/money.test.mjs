import assert from "node:assert/strict";
import test from "node:test";
import { formatExactAmount } from "../src/lib/money.ts";

test("decimal prices keep their kuruş in Turkish and English separators", () => {
  assert.equal(formatExactAmount(129.95, "tr", "symbol"), "₺129,95");
  assert.equal(formatExactAmount(129.95, "en", "symbol"), "₺129.95");
  assert.equal(formatExactAmount(129.5, "tr", "symbol"), "₺129,50");
  assert.equal(formatExactAmount(129.5, "en", "symbol"), "₺129.50");
  assert.equal(formatExactAmount(2499.9, "tr", "symbol"), "₺2.499,90");
  assert.equal(formatExactAmount(2499.9, "en", "symbol"), "₺2,499.90");
});

test("whole amounts show no decimals", () => {
  assert.equal(formatExactAmount(2500, "tr", "symbol"), "₺2.500");
  assert.equal(formatExactAmount(2500, "en", "symbol"), "₺2,500");
  assert.equal(formatExactAmount(0, "tr", "symbol"), "₺0");
});

test("currency code mode, negatives and floating-point noise", () => {
  assert.equal(formatExactAmount(129.95, "tr", "code"), "129,95 TRY");
  assert.equal(formatExactAmount(-129.95, "en", "symbol"), "−₺129.95");
  assert.equal(formatExactAmount(0.1 + 0.2, "tr", "symbol"), "₺0,30");
  assert.equal(formatExactAmount(99999999.99, "tr", "symbol"), "₺99.999.999,99");
});
