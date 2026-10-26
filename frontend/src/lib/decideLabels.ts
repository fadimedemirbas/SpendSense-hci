// Display-only wording for the Decide factor cards. Scores and thresholds are
// unchanged: this maps the existing level() result (High ≥17, Medium ≥9, Low <9
// on the 0–25 scale) to words that say what the level means for each factor.
//
// Directions differ per factor (see Analysis in Decide.tsx, `higherGood`):
//   Budget fit, Need level        – higher is better
//   Goal impact, Impulse signals  – lower is better
// Medium wording is deliberately neutral because the card's existing colour cut-off
// (13) can mark a Medium score either way.
export type Level = "High" | "Medium" | "Low";
export type Factor = "Budget fit" | "Need level" | "Goal impact" | "Impulse signals";

export const OUTCOME: Record<Factor, Record<Level, string>> = {
  "Budget fit": { High: "Fits well", Medium: "Fits, but tight", Low: "Stretches budget" },
  "Need level": { High: "Strong need", Medium: "Some need", Low: "Little need" },
  "Goal impact": { High: "Large impact", Medium: "Moderate impact", Low: "Small impact" },
  "Impulse signals": { High: "Many signals", Medium: "Some signals", Low: "Few signals" },
};

/** Without an active goal the score is 0 by definition, so say that instead. */
export const NO_GOAL = "No active goal";

export function outcomeLabel(factor: Factor, level: Level, hasGoal = true): string {
  if (factor === "Goal impact" && !hasGoal) return NO_GOAL;
  return OUTCOME[factor][level];
}
