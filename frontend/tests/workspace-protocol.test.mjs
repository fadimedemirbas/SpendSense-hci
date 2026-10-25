import assert from "node:assert/strict";
import test from "node:test";
import { prepareWorkspaceSave, assertLoadedWorkspace } from "../src/lib/workspaceProtocol.ts";

function workspace() {
  return {
    profile: {
      email: "test@example.com",
      income: 1,
      savings: 2,
      habits: [0, 1, 2, 0],
      onboarded: true,
      currency: "symbol",
    },
    entries: [{ id: "entry-1" }],
    goals: [{ id: "goal-1" }],
    analyses: [
      {
        id: "analysis-1",
        goalId: "goal-1",
        result: { goal: { id: "goal-1", name: "Historical laptop" } },
      },
    ],
    decisions: [{ id: "decision-1", reflection: 4 }],
    waiting: [{ id: "waiting-1" }],
  };
}
test("the frontend creates explicit deletion intent and preserves historical snapshots", () => {
  const previous = workspace();
  const next = { ...previous, entries: [], goals: [], decisions: [], waiting: [] };
  const { payload, workspace: canonical } = prepareWorkspaceSave(previous, next, "owner-1");
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.ownerId, "owner-1");
  assert.deepEqual(payload.deletions, {
    entries: ["entry-1"],
    goals: ["goal-1"],
    analyses: [],
    decisions: ["decision-1"],
    waiting: ["waiting-1"],
    reflections: ["decision-1"],
  });
  assert.equal(canonical.analyses[0].goalId, undefined);
  assert.equal(canonical.analyses[0].result.goal.name, "Historical laptop");
  assert.equal(previous.analyses[0].goalId, "goal-1");
});
test("ordinary saves do not authorize deletions and new invalid goal references reach FK validation", () => {
  const previous = workspace();
  const next = structuredClone(previous);
  next.profile.currency = "code";
  next.analyses[0].goalId = "unowned-goal";
  const { payload, workspace: canonical } = prepareWorkspaceSave(previous, next, "owner-1");
  assert.ok(Object.values(payload.deletions).every((ids) => ids.length === 0));
  assert.equal(canonical.analyses[0].goalId, "unowned-goal");
});
test("incomplete network responses cannot become empty writable workspaces", () => {
  const valid = workspace();
  assertLoadedWorkspace({ revision: 8, workspace: valid });
  for (const invalid of [
    null,
    {},
    { revision: null, workspace: valid },
    { revision: 1, workspace: { ...valid, entries: undefined } },
    { revision: 1, workspace: { ...valid, profile: null } },
    { revision: 1, workspace: { ...valid, profile: { habits: [] } } },
    { revision: 1, workspace: { ...valid, profile: { ...valid.profile, income: "1" } } },
    { revision: 1, workspace: { ...valid, entries: [null] } },
    { revision: Number.MAX_SAFE_INTEGER + 1, workspace: valid },
  ]) {
    assert.throws(() => assertLoadedWorkspace(invalid));
  }
  assert.throws(() => prepareWorkspaceSave(valid, { ...valid, entries: undefined }, "owner-1"));
});
