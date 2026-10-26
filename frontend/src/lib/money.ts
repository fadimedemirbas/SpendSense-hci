// Display-only amount formatting for the Decide flow. The global fmt() in ui.tsx
// (used everywhere else) rounds to whole lira and is intentionally unchanged.
export type CurrencyMode = "symbol" | "code";

/**
 * Shows kuruş when the amount has them (129.95 → ₺129,95 / ₺129.95) and whole
 * amounts without decimals (2500 → ₺2.500 / ₺2,500), using the UI language's
 * separators. The number itself is never changed or stored.
 */
export function formatExactAmount(value: number, lang: "en" | "tr", mode: CurrencyMode) {
  const cents = Math.round(Math.abs(value) * 100);
  const fraction = cents % 100 !== 0 ? 2 : 0;
  const text = (cents / 100).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", {
    minimumFractionDigits: fraction,
    maximumFractionDigits: 2,
  });
  return (value < 0 ? "−" : "") + (mode === "symbol" ? `₺${text}` : `${text} TRY`);
}
