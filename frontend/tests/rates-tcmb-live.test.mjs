import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TCMB_URL, createRatesHandler, parseTcmbXml } from "../netlify/lib/tcmb.ts";
import { parseRatesResponse } from "../src/lib/rates.ts";
import { convertAmount, midRate, totalIn } from "../src/lib/currency.ts";

// The complete, unmodified https://www.tcmb.gov.tr/kurlar/today.xml response
// downloaded on 2026-10-30 (bulletin 2026/203 of 27.10.2026; Last-Modified
// Tue, 27 Oct 2026 12:30:02 GMT; 28–29 October were public holidays). The
// SHA-256 below is the hash of the live response, so this is the real document.
const FIXTURE = new URL("./fixtures/tcmb-2026-203.xml", import.meta.url);
const SHA256 = "aead695d5688abead9d7c8bf7d86613e553649feeee19e9205f5337cf2c1a1b6";
const NOW = new Date("2026-10-30T12:10:00Z");

test("the live TCMB bulletin fixture is byte-identical to the downloaded response", async () => {
  const bytes = await readFile(FIXTURE);
  assert.equal(bytes.length, 9097);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), SHA256);
});

test("the live bulletin parses to the published USD/EUR forex rates", async () => {
  const parsed = parseTcmbXml(await readFile(FIXTURE, "utf8"), NOW.toISOString());
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.snapshot, {
    source: "TCMB",
    bulletin: "2026/203",
    date: "2026-10-27",
    fetchedAt: NOW.toISOString(),
    rates: {
      USD: { buying: "49.6997", selling: "49.7892" },
      EUR: { buying: "55.4243", selling: "55.5241" },
    },
    eurUsd: "1.1152",
  });
});

test("/api/rates serves the live bulletin and the app accepts it", async () => {
  const xml = await readFile(FIXTURE);
  const calls = [];
  const handle = createRatesHandler({
    fetch: async (url) => {
      calls.push(String(url));
      return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
    },
    now: () => NOW,
    log: () => {},
  });
  const response = await handle(new Request("https://spendsense.example/api/rates"));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [TCMB_URL]);
  const body = await response.json();
  // Midpoints are (ForexBuying + ForexSelling) / 2, exactly.
  assert.deepEqual(body.midpoints, { USD: "49.74445", EUR: "55.4742" });
  const rates = parseRatesResponse(body, NOW);
  assert.ok(rates, "the browser-side validator accepts the served snapshot");
  assert.equal(midRate("USD", rates), "49.74445");
  assert.equal(midRate("EUR", rates), "55.4742");

  // Conversions with the live midpoints, checked by hand (one rounding, half up):
  // 100 USD → 4974.445 → ₺4.974,45; 100 EUR → ₺5.547,42;
  // ₺1.000 → 1000 / 49.74445 = 20.1027… → $20,10; 1000 / 55.4742 = 18.0264… → €18,03;
  // 100 EUR → 5547.42 / 49.74445 = 111.5183… → $111,52 (TCMB's own cross rate: 1.1152).
  const amount = (value, from, to) => convertAmount(value, from, to, rates);
  assert.deepEqual(amount(100, "USD", "TRY"), {
    ok: true,
    amount: 4974.45,
    minor: 497445,
    currency: "TRY",
    approximate: true,
  });
  assert.equal(amount(100, "EUR", "TRY").amount, 5547.42);
  assert.equal(amount(1000, "TRY", "USD").amount, 20.1);
  assert.equal(amount(1000, "TRY", "EUR").amount, 18.03);
  assert.equal(amount(100, "EUR", "USD").amount, 111.52);
  assert.equal(amount(129.95, "TRY", "TRY").approximate, false);
  // A mixed total is converted once: ₺1.000 + $10 + €10 = 1000 + 497.4445 + 554.742 → ₺2.052,19.
  const total = totalIn(
    [
      { amount: 1000, currency: "TRY" },
      { amount: 10, currency: "USD" },
      { amount: 10, currency: "EUR" },
    ],
    "TRY",
    rates,
  );
  assert.equal(total.ok && total.amount, 2052.19);
});
