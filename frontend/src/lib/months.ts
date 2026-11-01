// Calendar months for the Money screen ("YYYY-MM" keys). Pure functions only.

export type MonthKey = string;

/** "2026-11" for any YYYY-MM-DD date. */
export const monthOf = (day: string): MonthKey => day.slice(0, 7);

/** The month `delta` months away, e.g. shiftMonth("2026-01", -1) === "2025-12". */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, index] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + delta;
  const nextYear = Math.floor(total / 12);
  return `${String(nextYear).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * The months the user can browse: from the month of the oldest record up to the
 * current month (records cannot be dated in the future).
 */
export function monthBounds(dates: readonly string[], today: string) {
  const latest = monthOf(today);
  const earliest = dates.reduce<MonthKey>(
    (min, date) => (monthOf(date) < min ? monthOf(date) : min),
    latest,
  );
  return { earliest, latest };
}

/** "November 2026" / "Kasım 2026". */
export function formatMonth(month: MonthKey, lang: "en" | "tr"): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString(
    lang === "tr" ? "tr-TR" : "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
}
