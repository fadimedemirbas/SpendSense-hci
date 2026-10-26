import assert from "node:assert/strict";
import test from "node:test";
import { level } from "../src/store.ts";
import { NO_GOAL, OUTCOME, outcomeLabel } from "../src/lib/decideLabels.ts";

// Independent statement of what each factor's score means (from analyze()).
const HIGHER_IS_BETTER = {
  "Budget fit": true,
  "Need level": true,
  "Goal impact": false,
  "Impulse signals": false,
};
const FAVOURABLE = new Set(["Fits well", "Strong need", "Small impact", "Few signals"]);
const UNFAVOURABLE = new Set(["Stretches budget", "Little need", "Large impact", "Many signals"]);

test("existing level thresholds are unchanged (0–25 scale)", () => {
  assert.deepEqual([0, 8, 9, 16, 17, 25].map(level), [
    "Low",
    "Low",
    "Medium",
    "Medium",
    "High",
    "High",
  ]);
});

test("every score maps to wording that matches its factor's direction", () => {
  for (const [factor, higherIsBetter] of Object.entries(HIGHER_IS_BETTER)) {
    for (let score = 0; score <= 25; score++) {
      const label = outcomeLabel(factor, level(score));
      if (score >= 17)
        assert.ok(
          (higherIsBetter ? FAVOURABLE : UNFAVOURABLE).has(label),
          `${factor} ${score} → ${label}`,
        );
      else if (score < 9)
        assert.ok(
          (higherIsBetter ? UNFAVOURABLE : FAVOURABLE).has(label),
          `${factor} ${score} → ${label}`,
        );
      else
        assert.ok(
          !FAVOURABLE.has(label) && !UNFAVOURABLE.has(label),
          `${factor} ${score} → ${label} should be neutral`,
        );
    }
  }
});

test("labels are distinct per factor and the old ambiguous words are gone", () => {
  for (const [factor, labels] of Object.entries(OUTCOME)) {
    const words = Object.values(labels);
    assert.equal(new Set(words).size, 3, factor);
    for (const word of words) assert.ok(!["High", "Medium", "Low"].includes(word));
  }
});

test("goal impact without an active goal says so instead of a level", () => {
  assert.equal(outcomeLabel("Goal impact", level(0), false), NO_GOAL);
  assert.equal(outcomeLabel("Goal impact", level(0), true), "Small impact");
  assert.equal(outcomeLabel("Budget fit", level(25), false), "Fits well");
});
