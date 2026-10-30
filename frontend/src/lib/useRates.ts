import { useEffect, useSyncExternalStore } from "react";
import { createRatesClient, type RatesClient, type RatesState } from "./rates.ts";

// One client per page, so every component reads the same validated snapshot.
let client: RatesClient | null = null;
export function ratesClient(): RatesClient {
  client ??= createRatesClient({
    fetch: (input, init) => fetch(input, init),
    storage: (() => {
      try {
        return window.localStorage;
      } catch {
        return null; // storage blocked: rates still work, just not offline
      }
    })(),
    isOnline: () => navigator.onLine !== false,
  });
  return client;
}

/**
 * Current exchange rates for display and conversion. Refreshes on mount and when
 * the connection returns; the client itself prevents duplicate or rapid requests.
 * Used only where a figure mixes currencies: with `needed` false the screen
 * still reads any cached snapshot but sends no request (TRY-only users never wait
 * for, or depend on, exchange rates).
 */
export function useRates(needed = true): RatesState {
  const rates = ratesClient();
  const state = useSyncExternalStore(rates.subscribe, rates.getState, rates.getState);
  useEffect(() => {
    if (!needed) return;
    void rates.refresh();
    const online = () => void rates.refresh();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [rates, needed]);
  return state;
}
