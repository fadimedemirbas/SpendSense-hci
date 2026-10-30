// Client-side TCMB exchange rates: fetches GET /api/rates, validates every
// response with validateRateSnapshot, keeps the last valid snapshot in
// localStorage for offline use and reports how trustworthy it is.
// Framework-free so it can be tested in Node; React access is in useRates.ts.
import { rateAgeDays, validateRateSnapshot, type ValidRates } from "./currency.ts";

export const RATES_ENDPOINT = "/api/rates";
/** Versioned key: a format change gets a new key instead of misreading old data. */
export const RATES_CACHE_KEY = "ss.rates.v1";
const CACHE_VERSION = 1;
const MAX_CACHE_CHARS = 4096;
/** A snapshot received longer ago than this is shown as possibly outdated. */
export const FRESH_FOR_MS = 6 * 60 * 60 * 1000;
/**
 * A bulletin older than this is possibly outdated even if just received
 * (covers a normal weekend: Friday's bulletin is still current on Monday).
 */
export const STALE_AFTER_BULLETIN_DAYS = 4;
/** A successful fetch is reused for this long (the API itself is CDN-cached). */
export const MIN_REFRESH_MS = 10 * 60 * 1000;
/** After a failure, wait this long before trying again automatically. */
export const RETRY_AFTER_MS = 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type RatesStatus = "fresh" | "stale" | "unavailable";
export type RatesError = "offline" | "unavailable" | "invalid-response";
export interface RatesState {
  /** fresh: recent and current. stale: usable but possibly outdated. unavailable: no rates. */
  readonly status: RatesStatus;
  /** Validated rates for conversion, or null. Never invented. */
  readonly rates: ValidRates | null;
  /** TCMB publication date of the bulletin (YYYY-MM-DD). */
  readonly bulletinDate: string | null;
  readonly bulletin: string | null;
  /** When this browser received the snapshot (ISO). */
  readonly receivedAt: string | null;
  readonly source: "network" | "cache" | null;
  readonly loading: boolean;
  /** Why the latest refresh did not produce new rates (rates may still be present). */
  readonly error: RatesError | null;
}

interface CacheEntry {
  readonly rates: ValidRates;
  readonly receivedAt: number;
  readonly source: "network" | "cache";
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Validates an /api/rates body. Anything but a valid snapshot is rejected. */
export function parseRatesResponse(body: unknown, now: Date): ValidRates | null {
  if (typeof body !== "object" || body === null) return null;
  const { ok, snapshot } = body as { ok?: unknown; snapshot?: unknown };
  if (ok !== true) return null;
  const result = validateRateSnapshot(snapshot, now);
  return result.ok ? result.rates : null;
}

function safely<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

/** Restores the cached snapshot; corrupted, oversized or invalid data is removed. */
export function readCachedRates(storage: StorageLike | null, now: Date): CacheEntry | null {
  if (!storage) return null;
  const raw = safely(() => storage.getItem(RATES_CACHE_KEY), null);
  if (raw === null) return null;
  const discard = () => {
    safely(() => storage.removeItem(RATES_CACHE_KEY), undefined);
    return null;
  };
  if (typeof raw !== "string" || raw.length > MAX_CACHE_CHARS) return discard();
  const parsed = safely(() => JSON.parse(raw) as unknown, null);
  if (typeof parsed !== "object" || parsed === null) return discard();
  const { version, receivedAt, snapshot } = parsed as Record<string, unknown>;
  const received = typeof receivedAt === "string" ? Date.parse(receivedAt) : NaN;
  if (version !== CACHE_VERSION || !Number.isFinite(received)) return discard();
  if (received > now.getTime() + CLOCK_SKEW_MS) return discard();
  const result = validateRateSnapshot(snapshot, now);
  if (!result.ok) return discard();
  return { rates: result.rates, receivedAt: received, source: "cache" };
}

export function writeCachedRates(storage: StorageLike | null, entry: CacheEntry) {
  if (!storage) return;
  const value = JSON.stringify({
    version: CACHE_VERSION,
    receivedAt: new Date(entry.receivedAt).toISOString(),
    snapshot: entry.rates.snapshot,
  });
  if (value.length <= MAX_CACHE_CHARS)
    safely(() => storage.setItem(RATES_CACHE_KEY, value), undefined);
}

/** Fresh only when received recently AND the bulletin itself is recent. */
export function ratesStatus(entry: CacheEntry | null, now: Date): RatesStatus {
  if (!entry) return "unavailable";
  const recent = now.getTime() - entry.receivedAt <= FRESH_FOR_MS;
  const current = rateAgeDays(entry.rates, now) <= STALE_AFTER_BULLETIN_DAYS;
  return recent && current ? "fresh" : "stale";
}

function stateOf(
  entry: CacheEntry | null,
  now: Date,
  loading: boolean,
  error: RatesError | null,
): RatesState {
  return Object.freeze({
    status: ratesStatus(entry, now),
    rates: entry?.rates ?? null,
    bulletinDate: entry?.rates.snapshot.date ?? null,
    bulletin: entry?.rates.snapshot.bulletin ?? null,
    receivedAt: entry ? new Date(entry.receivedAt).toISOString() : null,
    source: entry?.source ?? null,
    loading,
    error,
  });
}

export interface RatesClientOptions {
  fetch: Fetch;
  storage: StorageLike | null;
  now?: () => Date;
  isOnline?: () => boolean;
}

/**
 * One shared source of rates. Concurrent refresh() calls share one request; a
 * new snapshot replaces the current one atomically and only if its bulletin is
 * not older (a CDN may briefly serve an earlier bulletin).
 */
export function createRatesClient({
  fetch: fetchImpl,
  storage,
  now = () => new Date(),
  isOnline = () => true,
}: RatesClientOptions) {
  let entry = readCachedRates(storage, now());
  let error: RatesError | null = null;
  let loading = false;
  let lastFailure = 0;
  // A snapshot restored from a recent visit counts as a recent successful fetch.
  let lastSuccess = entry?.receivedAt ?? 0;
  let inflight: Promise<RatesState> | null = null;
  let state = stateOf(entry, now(), loading, error);
  const listeners = new Set<() => void>();
  const publish = () => {
    state = stateOf(entry, now(), loading, error);
    listeners.forEach((listener) => listener());
  };

  async function download(): Promise<void> {
    try {
      const response = await fetchImpl(RATES_ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      const time = now();
      if (!response.ok) {
        error = "unavailable";
        lastFailure = time.getTime();
        return;
      }
      const rates = parseRatesResponse(body, time);
      if (!rates) {
        error = "invalid-response";
        lastFailure = time.getTime();
        return;
      }
      error = null;
      lastFailure = 0;
      lastSuccess = time.getTime();
      if (!entry || rates.snapshot.date >= entry.rates.snapshot.date) {
        entry = { rates, receivedAt: time.getTime(), source: "network" };
        writeCachedRates(storage, entry);
      }
    } catch {
      error = isOnline() ? "unavailable" : "offline";
      lastFailure = now().getTime();
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /**
     * Fetches unless a recent snapshot exists or a failure just happened
     * (`force` skips those waits). Offline it only reports "offline".
     */
    refresh({ force = false } = {}): Promise<RatesState> {
      if (inflight) return inflight;
      const time = now().getTime();
      if (!force && lastSuccess && time - lastSuccess < MIN_REFRESH_MS)
        return Promise.resolve(state);
      if (!force && lastFailure && time - lastFailure < RETRY_AFTER_MS)
        return Promise.resolve(state);
      if (!isOnline()) {
        error = "offline";
        publish();
        return Promise.resolve(state);
      }
      loading = true;
      publish();
      const run = download()
        .finally(() => {
          loading = false;
          inflight = null;
          publish();
        })
        .then(() => state);
      inflight = run;
      return run;
    },
  };
}
export type RatesClient = ReturnType<typeof createRatesClient>;
