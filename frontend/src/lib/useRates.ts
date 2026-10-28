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
 * Not used by any screen yet (Phase 5 integrates it).
 */
export function useRates(): RatesState {
  const rates = ratesClient();
  const state = useSyncExternalStore(rates.subscribe, rates.getState, rates.getState);
  useEffect(() => {
    void rates.refresh();
    const online = () => void rates.refresh();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [rates]);
  return state;
}
