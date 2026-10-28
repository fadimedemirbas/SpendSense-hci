import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ERROR_CACHE,
  MAX_XML_BYTES,
  SUCCESS_CACHE,
  TCMB_URL,
  createRatesHandler,
  parseTcmbXml,
  perUnit,
} from "../netlify/lib/tcmb.ts";
import { validateRateSnapshot } from "../src/lib/currency.ts";
import { networkOnlyRequest } from "../src/pwa/policy.ts";

// Structure and values from TCMB bulletin 2026/166 (kurlar/202609/04092026.xml),
// reduced to the USD, EUR and JPY elements. USD/EUR figures and the JPY Unit
// (100) and ForexBuying are the published values; other JPY figures are filler.
const currency = (code, fields) =>
  `<Currency CrossOrder="0" Kod="${code}" CurrencyCode="${code}">` +
  Object.entries(fields)
    .map(([name, value]) => (value === "" ? `<${name}/>` : `<${name}>${value}</${name}>`))
    .join("") +
  `</Currency>`;
const USD = {
  Unit: "1",
  Isim: "ABD DOLARI",
  CurrencyName: "US DOLLAR",
  ForexBuying: "48.2326",
  ForexSelling: "48.3195",
  BanknoteBuying: "48.1988",
  BanknoteSelling: "48.3920",
  CrossRateUSD: "",
  CrossRateOther: "",
};
const EUR = {
  Unit: "1",
  Isim: "EURO",
  CurrencyName: "EURO",
  ForexBuying: "56.0571",
  ForexSelling: "56.1581",
  BanknoteBuying: "56.0179",
  BanknoteSelling: "56.2423",
  CrossRateUSD: "",
  CrossRateOther: "1.1622",
};
const JPY = { Unit: "100", Isim: "JAPON YENİ", ForexBuying: "30.7757", ForexSelling: "30.9800" };
function xml({
  usd = USD,
  eur = EUR,
  root = 'Tarih="04.09.2026" Date="09/04/2026"  Bulten_No="2026/166"',
  extra = "",
} = {}) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="isokur.xsl"?>\n` +
    `<Tarih_Date ${root} >\n` +
    [usd && currency("USD", usd), currency("JPY", JPY), eur && currency("EUR", eur), extra]
      .filter(Boolean)
      .join("\n") +
    `\n</Tarih_Date>`
  );
}
const NOW = new Date("2026-09-07T09:00:00Z"); // Monday after the Friday bulletin

function upstream(body, init = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (body instanceof Error) throw body;
    return typeof body === "function"
      ? body(options)
      : new Response(body, { status: 200, ...init });
  };
  return { fetch, calls };
}
function handler(body, options = {}) {
  const logs = [];
  const { fetch, calls } = upstream(body, options.init);
  const handle = createRatesHandler({
    fetch,
    now: () => options.now ?? NOW,
    log: (code, detail) => logs.push([code, detail]),
    timeoutMs: options.timeoutMs,
  });
  return { handle, calls, logs };
}
const get = (path = "/api/rates", init = {}) =>
  new Request(`https://spendsense.example${path}`, { method: "GET", ...init });

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), ERROR_CACHE["Cache-Control"]);
  assert.equal(
    response.headers.get("Netlify-CDN-Cache-Control"),
    ERROR_CACHE["Netlify-CDN-Cache-Control"],
  );
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
  // No internals: no stack, detail or upstream text in the client response.
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
  assert.doesNotMatch(JSON.stringify(body), /stack|Error:|\n\s+at |tcmb\.gov|status \d|ENOTFOUND/);
  assert.equal(body.snapshot, undefined);
  return body;
}

test("valid TCMB XML yields a validated snapshot with USD/EUR, bulletin metadata and midpoints", async () => {
  const { handle, calls, logs } = handler(xml());
  const response = await handle(get());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    rateType: "tcmb-forex-midpoint",
    snapshot: {
      source: "TCMB",
      bulletin: "2026/166",
      date: "2026-09-04",
      fetchedAt: "2026-09-07T09:00:00.000Z",
      rates: {
        USD: { buying: "48.2326", selling: "48.3195" },
        EUR: { buying: "56.0571", selling: "56.1581" },
      },
      eurUsd: "1.1622",
    },
    midpoints: { USD: "48.27605", EUR: "56.1076" },
  });
  // The response is exactly what the frontend validator accepts.
  assert.equal(validateRateSnapshot(body.snapshot, NOW).ok, true);
  assert.deepEqual(logs, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TCMB_URL);
  assert.equal(calls[0].options.method, "GET");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test("parsing extracts only USD and EUR, accepts empty and filled elements, ignores other currencies", () => {
  const parsed = parseTcmbXml(xml(), "2026-09-07T09:00:00.000Z");
  assert.equal(parsed.ok, true);
  assert.deepEqual(Object.keys(parsed.snapshot.rates), ["USD", "EUR"]);
  // Paired-tag empty elements are as valid as self-closing ones.
  const paired = xml().replace("<CrossRateUSD/>", "<CrossRateUSD></CrossRateUSD>");
  assert.equal(parseTcmbXml(paired, "2026-09-07T09:00:00.000Z").ok, true);
  // Without CrossRateOther the snapshot simply has no eurUsd check value.
  const noCross = parseTcmbXml(xml({ eur: { ...EUR, CrossRateOther: "" } }), "x");
  assert.equal(noCross.ok, true);
  assert.equal(noCross.snapshot.eurUsd, undefined);
});

test("Unit normalisation divides exactly by moving the decimal point", async () => {
  assert.equal(perUnit("48.2326", "1"), "48.2326");
  assert.equal(perUnit("30.7757", "100"), "0.307757");
  assert.equal(perUnit("4823.26", "100"), "48.2326");
  assert.equal(perUnit("4823", "10"), "482.3");
  assert.equal(perUnit("5", "1000"), "0.005");
  for (const [value, unit] of [
    ["48.2326", "0"],
    ["48.2326", "2"],
    ["48.2326", "15"],
    ["48.2326", ""],
    ["48,2326", "1"],
    ["-48.2", "1"],
    ["", "1"],
    ["4.8e1", "1"],
  ])
    assert.equal(perUnit(value, unit), null, `${value}/${unit}`);
  // A per-100 quote for USD gives the same snapshot as the per-1 quote.
  const scaled = { ...USD, Unit: "100", ForexBuying: "4823.26", ForexSelling: "4831.95" };
  const { handle } = handler(xml({ usd: scaled }));
  const body = await (await handle(get())).json();
  assert.deepEqual(body.snapshot.rates.USD, { buying: "48.2326", selling: "48.3195" });
  assert.equal(body.midpoints.USD, "48.27605");
});

test("invalid XML and unexpected formats are rejected as invalid upstream data", async () => {
  const documents = [
    "",
    "not xml at all",
    "<html><body>Bakım çalışması</body></html>",
    xml().replace("</Tarih_Date>", ""),
    xml().replace("Tarih_Date", "Root"),
    '<!DOCTYPE x [<!ENTITY e "x">]>' + xml(),
    xml({ root: 'Date="09/04/2026" Bulten_No="2026/166"' }),
    xml({ root: 'Tarih="05.09.2026" Date="09/04/2026" Bulten_No="2026/166"' }),
    xml({ root: 'Tarih="04.09.2026" Date="09/04/2026"' }),
    xml({ root: 'Tarih="31.02.2026" Date="02/31/2026" Bulten_No="2026/166"' }),
    xml({ usd: { ...USD, ForexBuying: "" } }),
    xml().replace('Kod="USD" CurrencyCode="USD"', 'Kod="USD" CurrencyCode="EUR"'),
    xml({ extra: currency("USD", USD) }),
    xml({ usd: { ...USD, Unit: "1", ForexBuying: "48.2326</ForexBuying><ForexBuying>1" } }),
  ];
  for (const document of documents) {
    const { handle, logs } = handler(document);
    await expectError(await handle(get()), 502, "invalid-upstream");
    assert.equal(logs[0][0], "invalid-upstream");
  }
});

test("missing USD or EUR fails instead of returning a partial snapshot", async () => {
  for (const missing of [{ usd: null }, { eur: null }, { usd: null, eur: null }]) {
    const { handle, logs } = handler(xml(missing));
    await expectError(await handle(get()), 502, "invalid-upstream");
    assert.match(logs[0][1], /missing/);
  }
});

test("invalid rate values fail Phase 1 validation and are never served", async () => {
  const bad = [
    { usd: { ...USD, ForexBuying: "0" } },
    { usd: { ...USD, ForexBuying: "-48.2326" } },
    { usd: { ...USD, ForexSelling: "abc" } },
    { usd: { ...USD, ForexBuying: "48,2326" } },
    { usd: { ...USD, ForexBuying: "48.3195", ForexSelling: "48.2326" } },
    { usd: { ...USD, ForexBuying: "30.0000" } },
    { eur: { ...EUR, CrossRateOther: "1.4000" } },
    { usd: { ...USD, Unit: "3" } },
    { usd: { ...USD, Unit: "100000", ForexBuying: "48.2326" } },
  ];
  for (const variant of bad) {
    const { handle } = handler(xml(variant));
    await expectError(await handle(get()), 502, "invalid-upstream");
  }
});

test("outdated or future bulletins are not served as current rates", async () => {
  // Weekends and holidays: the last bulletin stays valid for up to 10 days.
  const friday = handler(xml(), { now: new Date("2026-09-14T09:00:00Z") });
  assert.equal((await friday.handle(get())).status, 200);
  const old = handler(xml(), { now: new Date("2026-09-15T09:00:00Z") });
  await expectError(await old.handle(get()), 503, "rates-outdated");
  const future = handler(xml(), { now: new Date("2026-09-02T09:00:00Z") });
  await expectError(await future.handle(get()), 502, "invalid-upstream");
});

test("network failures, HTTP errors, redirects and oversized bodies are handled safely", async () => {
  const network = handler(new TypeError("fetch failed: getaddrinfo ENOTFOUND www.tcmb.gov.tr"));
  await expectError(await network.handle(get()), 502, "upstream-unavailable");
  for (const status of [404, 500, 503]) {
    const { handle } = handler("<html>error</html>", { init: { status } });
    await expectError(await handle(get()), 502, "upstream-unavailable");
  }
  const redirected = handler(() => {
    const response = new Response(xml());
    Object.defineProperty(response, "url", { value: "https://evil.example/today.xml" });
    return response;
  });
  await expectError(await redirected.handle(get()), 502, "invalid-upstream");
  const declared = handler(xml(), {
    init: { headers: { "content-length": String(MAX_XML_BYTES + 1) } },
  });
  await expectError(await declared.handle(get()), 502, "invalid-upstream");
  const streamed = handler(xml({ extra: `<!--${"x".repeat(MAX_XML_BYTES)}-->` }));
  await expectError(await streamed.handle(get()), 502, "invalid-upstream");
  const binary = handler(() => new Response(new Uint8Array([0xff, 0xfe, 0xfd])));
  await expectError(await binary.handle(get()), 502, "invalid-upstream");
});

test("timeouts abort the upstream request, including a stalled body", async () => {
  let aborted = false;
  const hanging = handler(
    (options) =>
      new Promise((_, reject) =>
        options.signal.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        }),
      ),
    { timeoutMs: 20 },
  );
  await expectError(await hanging.handle(get()), 504, "upstream-timeout");
  assert.equal(aborted, true);

  const stalledBody = handler(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("<Tarih_Date"));
          },
        }),
      ),
    { timeoutMs: 20 },
  );
  await expectError(await stalledBody.handle(get()), 504, "upstream-timeout");
});

test("only GET is accepted and the request cannot steer the upstream URL", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const { handle, calls } = handler(xml());
    const response = await handle(get("/api/rates", { method }));
    assert.equal(response.headers.get("Allow"), "GET");
    if (method === "HEAD") assert.equal(response.status, 405);
    else await expectError(response, 405, "method-not-allowed");
    assert.equal(calls.length, 0, method);
  }
  const { handle, calls } = handler(xml());
  await handle(
    get("/api/rates?url=https://evil.example/&date=01012020", {
      headers: { "X-Forwarded-Host": "evil.example", Authorization: "Bearer secret" },
    }),
  );
  assert.equal(calls[0].url, TCMB_URL);
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test("cache headers: shared CDN copy for successes, nothing cached for errors", async () => {
  const ok = await handler(xml()).handle(get());
  assert.equal(ok.headers.get("Cache-Control"), "public, max-age=300");
  assert.equal(
    ok.headers.get("Netlify-CDN-Cache-Control"),
    "public, durable, max-age=1800, stale-while-revalidate=3600",
  );
  assert.deepEqual(SUCCESS_CACHE, {
    "Cache-Control": "public, max-age=300",
    "Netlify-CDN-Cache-Control": "public, durable, max-age=1800, stale-while-revalidate=3600",
  });
  const error = await handler(new TypeError("down")).handle(get());
  assert.equal(error.headers.get("Cache-Control"), "no-store");
  assert.equal(error.headers.get("Netlify-CDN-Cache-Control"), "no-store");
  // The cached body always names its own TCMB bulletin date and fetch time.
  const body = await (await handler(xml()).handle(get())).json();
  assert.equal(body.snapshot.date, "2026-09-04");
  assert.equal(body.snapshot.bulletin, "2026/166");
});

// Minimal reader for the flat [[redirects]] tables (same approach as deployment.test.mjs).
function redirects(source) {
  return source
    .split(/^\[\[/m)
    .filter((block) => block.startsWith("redirects]]"))
    .map((block) =>
      Object.fromEntries(
        [...block.matchAll(/^\s*([\w-]+)\s*=\s*(?:"([^"]*)"|(\d+))/gm)].map((m) => [
          m[1],
          m[2] ?? Number(m[3]),
        ]),
      ),
    );
}

test("Netlify routes /api/rates to the function before the generic /api/* rule", async () => {
  const source = await readFile(new URL("../../netlify.toml", import.meta.url), "utf8");
  assert.match(source, /^\[functions\]\s*\n\s*directory\s*=\s*"netlify\/functions"/m);
  const rules = redirects(source);
  const resolve = (path) =>
    rules.find((rule) =>
      rule.from.endsWith("*") ? path.startsWith(rule.from.replace(/\*$/, "")) : path === rule.from,
    );
  assert.deepEqual(resolve("/api/rates"), {
    from: "/api/rates",
    to: "/.netlify/functions/rates",
    status: 200,
  });
  const rateRule = rules.findIndex((rule) => rule.from === "/api/rates");
  const apiRule = rules.findIndex((rule) => rule.from === "/api/*");
  assert.ok(rateRule >= 0 && rateRule < apiRule);
  // Everything else under /api, auth callbacks and SPA routes behave as before.
  for (const path of [
    "/api/data",
    "/api/rates/extra",
    "/api/ratesx",
    "/auth/v1/token",
    "/rpc/save",
  ])
    assert.equal(resolve(path)?.status, 404, path);
  for (const path of ["/", "/home", "/money", "/how-it-works", "/settings"])
    assert.deepEqual([resolve(path)?.to, resolve(path)?.status], ["/index.html", 200], path);
  assert.ok(rules.every((rule) => !rule.force));
  // The function file exists where the configured directory points.
  await readFile(new URL("../netlify/functions/rates.ts", import.meta.url), "utf8");
});

test("the service worker treats /api/rates as network-only (never cached by the PWA)", () => {
  const origin = "https://spendsense.example";
  for (const path of ["/api/rates", "/api/rates?refresh=1"])
    assert.equal(networkOnlyRequest(new URL(path, origin), origin, false), true, path);
});
