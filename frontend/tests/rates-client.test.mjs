import assert from "node:assert/strict";
import test from "node:test";
import {
  FRESH_FOR_MS,
  MIN_REFRESH_MS,
  RATES_CACHE_KEY,
  RATES_ENDPOINT,
  RETRY_AFTER_MS,
  createRatesClient,
  parseRatesResponse,
  readCachedRates,
} from "../src/lib/rates.ts";
import { convertAmount, totalIn } from "../src/lib/currency.ts";
import { networkOnlyRequest } from "../src/pwa/policy.ts";

// The /api/rates body for TCMB bulletin 2026/166 (see rates-api.test.mjs).
const snapshot = (date = "2026-09-04", bulletin = "2026/166") => ({
  source: "TCMB",
  bulletin,
  date,
  fetchedAt: `${date}T13:00:00.000Z`,
  rates: {
    USD: { buying: "48.2326", selling: "48.3195" },
    EUR: { buying: "56.0571", selling: "56.1581" },
  },
  eurUsd: "1.1622",
});
const body = (snap = snapshot()) => ({
  ok: true,
  rateType: "tcmb-forex-midpoint",
  snapshot: snap,
  midpoints: { USD: "48.27605", EUR: "56.1076" },
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}
function clock(start = "2026-09-07T09:00:00Z") {
  let time = new Date(start).getTime();
  return {
    now: () => new Date(time),
    advance: (ms) => (time += ms),
  };
}
function api(responses) {
  const calls = [];
  const queue = [...responses];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next();
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { fetch, calls };
}
function client({
  responses = [{ body: body() }],
  storage = memoryStorage(),
  time = clock(),
  online = true,
} = {}) {
  const network = api(responses);
  const rates = createRatesClient({
    fetch: network.fetch,
    storage,
    now: time.now,
    isOnline: () => (typeof online === "function" ? online() : online),
  });
  return { rates, network, storage, time };
}

test("API responses are validated before use; anything else is rejected", () => {
  const now = new Date("2026-09-07T09:00:00Z");
  const valid = parseRatesResponse(body(), now);
  assert.equal(valid.snapshot.bulletin, "2026/166");
  for (const bad of [
    null,
    "text",
    {},
    { ok: false, error: { code: "upstream-timeout" } },
    { ok: "true", snapshot: snapshot() },
    { ok: true },
    { ok: true, snapshot: { ...snapshot(), source: "ECB" } },
    { ok: true, snapshot: { ...snapshot(), rates: { USD: snapshot().rates.USD } } },
    {
      ok: true,
      snapshot: {
        ...snapshot(),
        rates: { ...snapshot().rates, USD: { buying: "0", selling: "1" } },
      },
    },
    { ok: true, snapshot: snapshot("2026-09-20") }, // future bulletin
  ])
    assert.equal(parseRatesResponse(bad, now), null, JSON.stringify(bad));
});

test("a successful fetch gives fresh, dated rates and is cached in a small versioned format", async () => {
  const { rates, network, storage } = client();
  assert.equal(rates.getState().status, "unavailable");
  assert.equal(rates.getState().rates, null);
  const state = await rates.refresh();
  assert.equal(network.calls.length, 1);
  assert.equal(network.calls[0].url, RATES_ENDPOINT);
  assert.equal(network.calls[0].init.method, "GET");
  assert.equal(network.calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(
    [state.status, state.bulletinDate, state.bulletin, state.source, state.loading, state.error],
    ["fresh", "2026-09-04", "2026/166", "network", false, null],
  );
  assert.equal(state.receivedAt, "2026-09-07T09:00:00.000Z");
  assert.equal(amountOf(convertAmount(100, "USD", "TRY", state.rates)), 4827.61);
  const cached = JSON.parse(storage.data.get(RATES_CACHE_KEY));
  assert.deepEqual(Object.keys(cached).sort(), ["receivedAt", "snapshot", "version"]);
  assert.equal(cached.version, 1);
  assert.ok(storage.data.get(RATES_CACHE_KEY).length < 1024);
  // /api/rates stays network-only in the service worker; the app keeps its own copy.
  assert.equal(
    networkOnlyRequest(new URL(RATES_ENDPOINT, "https://x.example"), "https://x.example", false),
    true,
  );
});
const amountOf = (result) => {
  assert.equal(result.ok, true);
  return result.amount;
};

test("cached rates are restored on the next visit and labelled by age", async () => {
  const time = clock();
  const first = client({ time });
  await first.rates.refresh();
  // Reopened five minutes later: still fresh, no new request needed yet.
  time.advance(5 * 60 * 1000);
  const second = client({ storage: first.storage, time, responses: [new Error("down")] });
  assert.equal(second.rates.getState().status, "fresh");
  assert.equal(second.rates.getState().source, "cache");
  await second.rates.refresh();
  assert.equal(second.network.calls.length, 0);
  // Two days later the same copy is shown as possibly outdated, never as current.
  time.advance(2 * 24 * 60 * 60 * 1000);
  const third = client({ storage: first.storage, time, online: false });
  const state = await third.rates.refresh();
  assert.deepEqual(
    [state.status, state.source, state.error, state.bulletinDate],
    ["stale", "cache", "offline", "2026-09-04"],
  );
  assert.equal(third.network.calls.length, 0); // offline: no request attempted
  assert.notEqual(state.rates, null); // still usable for approximate conversion
});

test("a just-fetched but old bulletin is stale (long holidays), not fresh", async () => {
  const { rates } = client({ time: clock("2026-09-11T09:00:00Z") }); // 7 days after 2026-09-04
  assert.equal((await rates.refresh()).status, "stale");
  const recent = client({ time: clock("2026-09-07T09:00:00Z") }); // Monday after a Friday bulletin
  assert.equal((await recent.rates.refresh()).status, "fresh");
});

test("corrupted or tampered cache data is discarded safely", () => {
  const now = new Date("2026-09-07T09:00:00Z");
  const good = JSON.stringify({
    version: 1,
    receivedAt: "2026-09-07T08:00:00.000Z",
    snapshot: snapshot(),
  });
  assert.notEqual(readCachedRates(memoryStorage({ [RATES_CACHE_KEY]: good }), now), null);
  for (const raw of [
    "not json",
    "null",
    "[]",
    JSON.stringify({ version: 2, receivedAt: "2026-09-07T08:00:00Z", snapshot: snapshot() }),
    JSON.stringify({ version: 1, receivedAt: "yesterday", snapshot: snapshot() }),
    JSON.stringify({ version: 1, receivedAt: "2026-09-09T08:00:00Z", snapshot: snapshot() }),
    JSON.stringify({
      version: 1,
      receivedAt: "2026-09-07T08:00:00Z",
      snapshot: { ...snapshot(), eurUsd: "1.5" },
    }),
    JSON.stringify({
      version: 1,
      receivedAt: "2026-09-07T08:00:00Z",
      snapshot: { source: "TCMB" },
    }),
    "x".repeat(5000),
  ]) {
    const storage = memoryStorage({ [RATES_CACHE_KEY]: raw });
    assert.equal(readCachedRates(storage, now), null, raw.slice(0, 60));
    assert.equal(storage.data.has(RATES_CACHE_KEY), false); // removed, not reused
  }
  // Storage that throws (blocked or private mode) behaves like no cache.
  const throwing = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceeded");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
  assert.equal(readCachedRates(throwing, now), null);
  const { rates } = client({ storage: throwing });
  return rates.refresh().then((state) => assert.equal(state.status, "fresh"));
});

test("missing rates are reported as unavailable; mixed currencies are not added", async () => {
  for (const responses of [
    [{ status: 502, body: { ok: false, error: { code: "upstream-unavailable" } } }],
    [{ body: { ok: true, snapshot: { source: "TCMB" } } }],
    [() => new Response("<html>", { status: 200 })],
    [new TypeError("Failed to fetch")],
  ]) {
    const { rates } = client({ responses });
    const state = await rates.refresh();
    assert.equal(state.status, "unavailable");
    assert.equal(state.rates, null);
    assert.ok(["unavailable", "invalid-response"].includes(state.error));
    const mixed = totalIn(
      [
        { amount: 1000, currency: "TRY" },
        { amount: 10, currency: "USD" },
      ],
      "TRY",
      state.rates,
    );
    assert.deepEqual([mixed.ok, mixed.reason], [false, "missing-rate"]);
    assert.deepEqual(mixed.subtotals, { TRY: 1000, USD: 10 });
  }
  const offline = client({ online: false });
  const state = await offline.rates.refresh();
  assert.deepEqual([state.status, state.error], ["unavailable", "offline"]);
  assert.equal(offline.network.calls.length, 0);
});

test("a failed refresh keeps the last valid rates, marked with the error", async () => {
  const time = clock();
  const { rates, storage } = client({ time, responses: [{ body: body() }, new TypeError("down")] });
  await rates.refresh();
  time.advance(FRESH_FOR_MS + 1);
  const state = await rates.refresh();
  assert.deepEqual(
    [state.status, state.error, state.bulletinDate],
    ["stale", "unavailable", "2026-09-04"],
  );
  assert.ok(storage.data.has(RATES_CACHE_KEY));
});

test("overlapping requests share one call and repeated calls are throttled", async () => {
  const time = clock();
  let release;
  let calls = 0;
  const { rates, network } = client({
    time,
    responses: [
      () =>
        ++calls > 1
          ? new Response(JSON.stringify(body()))
          : new Promise((resolve) => {
              release = () => resolve(new Response(JSON.stringify(body())));
            }),
    ],
  });
  const seen = [];
  rates.subscribe(() => seen.push(rates.getState().loading));
  const a = rates.refresh();
  const b = rates.refresh({ force: true });
  assert.equal(a, b); // the same in-flight request
  assert.equal(rates.getState().loading, true);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [stateA, stateB] = await Promise.all([a, b]);
  assert.equal(stateA, stateB);
  assert.equal(stateA.status, "fresh");
  assert.equal(network.calls.length, 1);
  assert.deepEqual(seen, [true, false]);
  await rates.refresh();
  time.advance(MIN_REFRESH_MS - 1);
  await rates.refresh();
  assert.equal(network.calls.length, 1); // reused within 10 minutes
  time.advance(2);
  await rates.refresh();
  assert.equal(network.calls.length, 2);
});

test("after a failure, automatic retries wait; a forced refresh may try again", async () => {
  const time = clock();
  const { rates, network } = client({ time, responses: [new TypeError("down")] });
  await rates.refresh();
  await rates.refresh();
  assert.equal(network.calls.length, 1);
  time.advance(RETRY_AFTER_MS + 1);
  await rates.refresh();
  assert.equal(network.calls.length, 2);
  await rates.refresh({ force: true });
  assert.equal(network.calls.length, 3);
});

test("an older bulletin served later never replaces a newer one", async () => {
  const time = clock("2026-09-08T09:00:00Z");
  const { rates } = client({
    time,
    responses: [
      { body: body(snapshot("2026-09-07", "2026/167")) },
      { body: body(snapshot("2026-09-04", "2026/166")) },
    ],
  });
  await rates.refresh();
  time.advance(MIN_REFRESH_MS + 1);
  const state = await rates.refresh();
  assert.deepEqual([state.bulletin, state.bulletinDate], ["2026/167", "2026-09-07"]);
});
