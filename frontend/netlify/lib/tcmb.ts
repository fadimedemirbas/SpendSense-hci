// Server-side TCMB exchange-rate retrieval for GET /api/rates.
// The upstream URL is fixed: nothing from the incoming request (query, body or
// headers) is forwarded, so this is not a proxy. Rates are parsed from TCMB's
// XML, normalised per 1 unit and validated with the same rules the frontend uses
// (validateRateSnapshot); anything that does not pass is an error, never a guess.
import { midRate, validateRateSnapshot, type RateSnapshot } from "../../src/lib/currency.ts";

export const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
/** today.xml is ~15 KB; anything far larger is not the document we expect. */
export const MAX_XML_BYTES = 256 * 1024;
export const UPSTREAM_TIMEOUT_MS = 8000;
/**
 * TCMB publishes on business days only. The longest Turkish holiday breaks
 * (bayram + bridge days + weekends) can reach 9 days, so a bulletin older than
 * this is treated as unavailable rather than served as the current rate.
 */
export const MAX_BULLETIN_AGE_DAYS = 10;

/* ---------- XML parsing (fixed TCMB schema, no dependencies) ---------- */

export type ParseResult =
  | { readonly ok: true; readonly snapshot: RateSnapshot }
  | { readonly ok: false; readonly detail: string };

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g))
    result[match[1]] = match[2].trim();
  return result;
}

/** Text of a child element that must appear exactly once ("" for an empty element). */
function child(block: string, name: string): string | null {
  const pattern = new RegExp(`<${name}\\s*/>|<${name}\\s*>([^<]*)</${name}\\s*>`, "g");
  const matches = [...block.matchAll(pattern)];
  return matches.length === 1 ? (matches[0][1] ?? "").trim() : null;
}

/**
 * Divides a TCMB decimal by its Unit (1, 10, 100, …) exactly, by moving the
 * decimal point. Returns null for anything that is not that shape.
 */
export function perUnit(value: string, unit: string): string | null {
  if (!/^\d+(\.\d+)?$/.test(value) || !/^10{0,6}$/.test(unit)) return null;
  const [whole, fraction = ""] = value.split(".");
  const decimals = fraction.length + unit.length - 1;
  const digits = (whole + fraction).padStart(decimals + 1, "0");
  const integer = digits.slice(0, digits.length - decimals).replace(/^0+(?=\d)/, "");
  const rest = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return rest ? `${integer}.${rest}` : integer;
}

function isoDate(tarih: string | undefined, date: string | undefined): string | null {
  const tr = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(tarih ?? ""); // DD.MM.YYYY
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date ?? ""); // MM/DD/YYYY
  if (!tr || !us) return null;
  const fromTr = `${tr[3]}-${tr[2]}-${tr[1]}`;
  return fromTr === `${us[3]}-${us[1]}-${us[2]}` ? fromTr : null;
}

/** Parses TCMB's today.xml into an unvalidated snapshot (validation happens next). */
export function parseTcmbXml(xml: string, fetchedAt: string): ParseResult {
  if (typeof xml !== "string" || xml.length === 0) return { ok: false, detail: "empty document" };
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { ok: false, detail: "unexpected DTD" };
  const body = xml
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const root = /^<Tarih_Date\b([^>]*)>([\s\S]*)<\/Tarih_Date>$/.exec(body);
  if (!root) return { ok: false, detail: "Tarih_Date root not found" };
  const meta = attributes(root[1]);
  const date = isoDate(meta.Tarih, meta.Date);
  if (!date) return { ok: false, detail: "bulletin date missing or inconsistent" };
  if (!meta.Bulten_No) return { ok: false, detail: "bulletin number missing" };

  const blocks = [...root[2].matchAll(/<Currency\b([^>]*)>([\s\S]*?)<\/Currency>/g)];
  const rates: Partial<Record<"USD" | "EUR", { buying: string; selling: string }>> = {};
  let eurUsd: string | undefined;
  for (const code of ["USD", "EUR"] as const) {
    const found = blocks.filter((block) => {
      const attrs = attributes(block[1]);
      return attrs.Kod === code || attrs.CurrencyCode === code;
    });
    if (found.length !== 1) return { ok: false, detail: `${code} missing or duplicated` };
    const [, attrSource, content] = found[0];
    const attrs = attributes(attrSource);
    if (attrs.Kod !== code || attrs.CurrencyCode !== code)
      return { ok: false, detail: `${code} codes disagree` };
    const unit = child(content, "Unit");
    const buyingRaw = child(content, "ForexBuying");
    const sellingRaw = child(content, "ForexSelling");
    if (unit === null || buyingRaw === null || sellingRaw === null)
      return { ok: false, detail: `${code} fields missing or duplicated` };
    const buying = perUnit(buyingRaw, unit);
    const selling = perUnit(sellingRaw, unit);
    if (!buying || !selling) return { ok: false, detail: `${code} rate or unit malformed` };
    rates[code] = { buying, selling };
    if (code === "EUR") {
      const cross = child(content, "CrossRateOther");
      if (cross) eurUsd = cross; // USD per 1 EUR; optional consistency check
    }
  }
  return {
    ok: true,
    snapshot: {
      source: "TCMB",
      bulletin: meta.Bulten_No,
      date,
      fetchedAt,
      rates: rates as RateSnapshot["rates"],
      ...(eurUsd ? { eurUsd } : {}),
    },
  };
}

/* ---------- upstream fetch ---------- */

export type FetchFailure = "upstream-unavailable" | "upstream-timeout" | "invalid-upstream";
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

class UpstreamError extends Error {
  readonly code: FetchFailure;
  constructor(code: FetchFailure, detail: string) {
    super(detail);
    this.code = code;
  }
}

async function readLimited(response: Response, limit: number, signal: AbortSignal) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit)
    throw new UpstreamError("invalid-upstream", "response too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    if (signal.aborted) throw new UpstreamError("upstream-timeout", "timed out reading");
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new UpstreamError("invalid-upstream", "response too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Fetches today.xml with a hard timeout covering the whole download. */
export async function fetchTcmbXml(
  fetchImpl: Fetch,
  { timeoutMs = UPSTREAM_TIMEOUT_MS, maxBytes = MAX_XML_BYTES } = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const timeout = new Promise<never>((_, reject) =>
      controller.signal.addEventListener("abort", () =>
        reject(new UpstreamError("upstream-timeout", "timed out")),
      ),
    );
    const download = (async () => {
      let response: Response;
      try {
        response = await fetchImpl(TCMB_URL, {
          method: "GET",
          headers: { Accept: "application/xml, text/xml" },
          redirect: "follow",
          signal: controller.signal,
          cache: "no-store",
        });
      } catch {
        if (controller.signal.aborted) throw new UpstreamError("upstream-timeout", "timed out");
        throw new UpstreamError("upstream-unavailable", "network error");
      }
      if (
        response.url &&
        !["www.tcmb.gov.tr", "tcmb.gov.tr"].includes(new URL(response.url).hostname)
      )
        throw new UpstreamError("invalid-upstream", "redirected away from TCMB");
      if (response.status !== 200)
        throw new UpstreamError("upstream-unavailable", `status ${response.status}`);
      try {
        return await readLimited(response, maxBytes, controller.signal);
      } catch (error) {
        if (error instanceof UpstreamError) throw error;
        if (controller.signal.aborted) throw new UpstreamError("upstream-timeout", "timed out");
        throw new UpstreamError("invalid-upstream", "unreadable body");
      }
    })();
    return await Promise.race([download, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- HTTP handler ---------- */

export type RatesErrorCode =
  | FetchFailure
  | "rates-outdated"
  | "method-not-allowed"
  | "internal-error";

const MESSAGES: Record<RatesErrorCode, string> = {
  "upstream-unavailable": "TCMB exchange rates are unavailable right now.",
  "upstream-timeout": "TCMB did not respond in time.",
  "invalid-upstream": "TCMB returned exchange-rate data that could not be validated.",
  "rates-outdated": "The latest TCMB bulletin is too old to use.",
  "method-not-allowed": "Only GET is supported.",
  "internal-error": "Exchange rates could not be prepared.",
};
const STATUS: Record<RatesErrorCode, number> = {
  "upstream-unavailable": 502,
  "upstream-timeout": 504,
  "invalid-upstream": 502,
  "rates-outdated": 503,
  "method-not-allowed": 405,
  "internal-error": 500,
};

/**
 * Successful responses: browsers may reuse them for 5 minutes; Netlify's CDN
 * keeps one shared copy for 30 minutes and may serve it for up to an hour more
 * while refreshing in the background. TCMB publishes once per business day
 * (around 15:30), and every response carries the bulletin's own date, so a cached
 * copy is never presented as "live". Errors are never cached.
 */
export const SUCCESS_CACHE = {
  "Cache-Control": "public, max-age=300",
  "Netlify-CDN-Cache-Control": "public, durable, max-age=1800, stale-while-revalidate=3600",
} as const;
export const ERROR_CACHE = {
  "Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
} as const;

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
const failure = (code: RatesErrorCode, extra: Record<string, string> = {}) =>
  json(
    STATUS[code],
    { ok: false, error: { code, message: MESSAGES[code] } },
    {
      ...ERROR_CACHE,
      ...extra,
    },
  );

export interface RatesHandlerOptions {
  fetch?: Fetch;
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
  /** Server-side log for diagnostics; details never reach the client. */
  log?: (code: RatesErrorCode, detail: string) => void;
}

export function createRatesHandler({
  fetch: fetchImpl = (input, init) => fetch(input, init),
  now = () => new Date(),
  timeoutMs,
  maxBytes,
  log = (code, detail) => console.warn(`[rates] ${code}: ${detail}`),
}: RatesHandlerOptions = {}) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") return failure("method-not-allowed", { Allow: "GET" });
    try {
      const xml = await fetchTcmbXml(fetchImpl, { timeoutMs, maxBytes });
      const time = now();
      const parsed = parseTcmbXml(xml, time.toISOString());
      if (!parsed.ok) {
        log("invalid-upstream", parsed.detail);
        return failure("invalid-upstream");
      }
      const validated = validateRateSnapshot(parsed.snapshot, time);
      if (!validated.ok) {
        log("invalid-upstream", validated.errors.join(" "));
        return failure("invalid-upstream");
      }
      const { snapshot } = validated.rates;
      const published = Date.parse(`${snapshot.date}T00:00:00Z`);
      const ageDays = Math.floor((time.getTime() - published) / 864e5);
      if (ageDays > MAX_BULLETIN_AGE_DAYS) {
        log("rates-outdated", `bulletin ${snapshot.bulletin} from ${snapshot.date}`);
        return failure("rates-outdated");
      }
      return json(
        200,
        {
          ok: true,
          rateType: "tcmb-forex-midpoint",
          snapshot,
          midpoints: {
            USD: midRate("USD", validated.rates),
            EUR: midRate("EUR", validated.rates),
          },
        },
        SUCCESS_CACHE,
      );
    } catch (error) {
      if (error instanceof UpstreamError) {
        log(error.code, error.message);
        return failure(error.code);
      }
      log("internal-error", "unexpected failure");
      return failure("internal-error");
    }
  };
}
