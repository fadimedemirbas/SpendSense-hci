import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkspaceProtocolError,
  CLIENT_PROTOCOL,
  assertLoadedWorkspace,
  normalizeLoadedWorkspace,
  prepareVersionedWorkspaceSave,
  prepareWorkspaceSave,
  workspaceLoadRequest,
} from "../src/lib/workspaceProtocol.ts";
import {
  CURRENCY_UNSUPPORTED_MESSAGE,
  UPDATE_REQUIRED_MESSAGE,
  emptyWorkspace,
  persistenceMessage,
} from "../src/lib/workspace.ts";
import { analyze, emptyProfile, purchaseEntry } from "../src/store.ts";
import { validateRateSnapshot } from "../src/lib/currency.ts";
import { toAnalysisInputs } from "../src/lib/analysisInput.ts";

// A workspace exactly as migration 202610250001 (and today's production) returns it.
function legacyLoaded() {
  const purchase = {
    name: "Headphones",
    price: 2500,
    cat: "Shopping",
    reasons: ["need"],
    feeling: "Calm",
    own: false,
    wait: "3d",
  };
  const goal = { id: "goal-1", name: "Laptop", target: 35000, saved: 1000, status: "Active" };
  return {
    profile: {
      email: "me@example.com",
      income: 1,
      savings: 2,
      habits: [0, 1, 2, 0],
      onboarded: true,
      currency: "code",
    },
    entries: [
      {
        id: "entry-1",
        type: "income",
        amount: 32000.5,
        cat: "Salary",
        name: "Salary",
        date: "2026-10-25",
      },
    ],
    goals: [goal],
    analyses: [
      {
        id: "analysis-1",
        purchase,
        result: { fit: 84, income: 22500, goal: { ...goal } },
        goalId: "goal-1",
        createdAt: "2026-10-25T12:00:00+00:00",
      },
    ],
    decisions: [
      {
        ...purchase,
        id: "decision-1",
        analysisId: "analysis-1",
        decision: "Wait",
        date: "2026-10-25",
        fit: 84,
        reflection: 4,
      },
    ],
    waiting: [
      {
        ...purchase,
        id: "waiting-1",
        analysisId: "analysis-1",
        added: "2026-10-25",
        review: "2026-10-28",
        fit: 84,
      },
    ],
  };
}
/** The same data as spendsense_load_workspace_v3 (protocol 3) returns it. */
function v3Loaded() {
  const loaded = legacyLoaded();
  loaded.profile.displayCurrency = "TRY";
  for (const record of [...loaded.entries, ...loaded.goals]) record.currency = "TRY";
  return loaded;
}

test("legacy records are normalised to TRY without changing amounts or mutating the input", () => {
  const loaded = legacyLoaded();
  const frozen = structuredClone(loaded);
  const workspace = normalizeLoadedWorkspace(loaded);
  assert.deepEqual(loaded, frozen); // input untouched
  assert.equal(workspace.profile.displayCurrency, "TRY");
  assert.equal(workspace.profile.currency, "code"); // the format preference is preserved
  assert.deepEqual(workspace.entries[0], { ...frozen.entries[0], currency: "TRY" });
  assert.deepEqual(workspace.goals[0], { ...frozen.goals[0], currency: "TRY" });
  assert.deepEqual(workspace.analyses[0].purchase, {
    ...frozen.analyses[0].purchase,
    currency: "TRY",
  });
  // The analysis result (history) is carried over as-is, not recalculated or copied into new values.
  assert.equal(workspace.analyses[0].result, loaded.analyses[0].result);
  assert.deepEqual(workspace.analyses[0].result, frozen.analyses[0].result);
  assert.equal(workspace.analyses[0].result.goal.currency, undefined);
  for (const key of ["decisions", "waiting"])
    assert.deepEqual(workspace[key][0], { ...frozen[key][0], currency: "TRY" });
  // Deterministic: the same input always gives the same output.
  assert.deepEqual(normalizeLoadedWorkspace(legacyLoaded()), workspace);
});

test("new TRY/USD/EUR records keep their own currency through normalisation", () => {
  const loaded = v3Loaded();
  loaded.profile.displayCurrency = "EUR";
  loaded.entries.push({ ...loaded.entries[0], id: "entry-2", amount: 500, currency: "USD" });
  loaded.goals[0].currency = "EUR";
  loaded.analyses[0].purchase.currency = "USD";
  loaded.waiting[0].currency = "USD";
  const workspace = normalizeLoadedWorkspace(loaded);
  assert.equal(workspace.profile.displayCurrency, "EUR");
  assert.deepEqual(
    workspace.entries.map((e) => [e.amount, e.currency]),
    [
      [32000.5, "TRY"],
      [500, "USD"],
    ],
  );
  assert.equal(workspace.goals[0].currency, "EUR");
  assert.equal(workspace.analyses[0].purchase.currency, "USD");
  assert.equal(workspace.waiting[0].currency, "USD");
  assert.equal(workspace.decisions[0].currency, "TRY");
});

test("protocol 3 load responses need the v3 marker and valid explicit currencies", () => {
  assertLoadedWorkspace({ protocol: 3, revision: 3, workspace: v3Loaded() }, 3);
  // A legacy response (no marker, no currencies) is not a protocol 3 response.
  assert.throws(
    () => assertLoadedWorkspace({ revision: 3, workspace: v3Loaded() }, 3),
    /Incomplete/,
  );
  assert.throws(
    () => assertLoadedWorkspace({ protocol: 3, revision: 3, workspace: legacyLoaded() }, 3),
    /Incomplete/,
  );
  const corruptions = [
    (w) => (w.profile.displayCurrency = "GBP"),
    (w) => (w.profile.displayCurrency = null),
    (w) => delete w.profile.displayCurrency,
    (w) => (w.entries[0].currency = "usd"),
    (w) => delete w.entries[0].currency,
    (w) => (w.goals[0].currency = ""),
    (w) => (w.analyses[0].purchase.currency = 1),
    (w) => (w.analyses[0].purchase = null),
    (w) => (w.decisions[0].currency = "TL"),
    (w) => (w.waiting[0].currency = "symbol"),
  ];
  for (const corrupt of corruptions) {
    const workspace = v3Loaded();
    corrupt(workspace);
    assert.throws(
      () => assertLoadedWorkspace({ protocol: 3, revision: 3, workspace }, 3),
      /Incomplete/,
    );
  }
});

test("protocol 1 (TRY-only screens) never accepts a foreign amount, even nested", () => {
  assertLoadedWorkspace({ revision: 3, workspace: legacyLoaded() });
  assertLoadedWorkspace({ revision: 3, workspace: legacyLoaded() }, 1);
  assertLoadedWorkspace({ revision: 3, workspace: v3Loaded() }, 1); // explicit TRY is fine
  for (const foreign of [
    (w) => (w.entries[0].currency = "USD"),
    (w) => (w.goals[0].currency = "EUR"),
    (w) => (w.analyses[0].purchase.currency = "USD"),
    (w) => (w.analyses[0].result.goal.currency = "EUR"),
    (w) => (w.decisions[0].currency = "USD"),
    (w) => (w.waiting[0].currency = "EUR"),
  ]) {
    const workspace = legacyLoaded();
    foreign(workspace);
    assert.throws(() => assertLoadedWorkspace({ revision: 3, workspace }, 1), /Incomplete/);
  }
});

test("the client protocol chooses the load RPC; this build is still TRY-only", () => {
  assert.equal(CLIENT_PROTOCOL, 1); // protocol 3 arrives with the currency-aware screens
  assert.deepEqual(workspaceLoadRequest(1, "user-1"), {
    fn: "spendsense_load_workspace",
    args: { expected_user_id: "user-1" },
  });
  assert.deepEqual(workspaceLoadRequest(3, "user-1"), {
    fn: "spendsense_load_workspace_v3",
    args: { expected_user_id: "user-1", client_protocol: 3 },
  });
  for (const protocol of [0, 2, 4, NaN])
    assert.throws(
      () => workspaceLoadRequest(protocol, "user-1"),
      (error) =>
        error instanceof WorkspaceProtocolError && error.code === "SS_PROTOCOL_UNSUPPORTED",
    );
});

test("protocol 3 serialises every currency and the display currency as schemaVersion 3", () => {
  const previous = normalizeLoadedWorkspace(v3Loaded());
  const next = structuredClone(previous);
  next.profile.displayCurrency = "USD";
  next.entries.push({
    id: "entry-2",
    type: "expense",
    amount: 15.99,
    currency: "EUR",
    cat: "Subscriptions",
    name: "Music",
    date: "2026-10-26",
  });
  const { payload } = prepareVersionedWorkspaceSave(previous, next, "owner-1", 3);
  assert.equal(payload.schemaVersion, 3);
  assert.equal(payload.ownerId, "owner-1");
  assert.equal(payload.profile.displayCurrency, "USD");
  assert.equal(payload.profile.currency, "code");
  assert.deepEqual(
    payload.entries.map((e) => [e.id, e.amount, e.currency]),
    [
      ["entry-1", 32000.5, "TRY"],
      ["entry-2", 15.99, "EUR"],
    ],
  );
  assert.equal(payload.goals[0].currency, "TRY");
  assert.equal(payload.analyses[0].purchase.currency, "TRY");
  assert.equal(payload.decisions[0].currency, "TRY");
  assert.equal(payload.waiting[0].currency, "TRY");
  assert.ok(Object.values(payload.deletions).every((ids) => ids.length === 0));
  // Round trip: what is saved is what normalisation produces on the next load.
  const reloaded = normalizeLoadedWorkspace(structuredClone(payload));
  assert.deepEqual(reloaded.entries, payload.entries);
});

test("missing or invalid currencies are never saved and never stripped", () => {
  const previous = normalizeLoadedWorkspace(v3Loaded());
  const breaks = [
    (w) => delete w.entries[0].currency,
    (w) => (w.entries[0].currency = "GBP"),
    (w) => delete w.goals[0].currency,
    (w) => delete w.analyses[0].purchase.currency,
    (w) => (w.decisions[0].currency = undefined),
    (w) => (w.waiting[0].currency = "eur"),
    (w) => delete w.profile.displayCurrency,
  ];
  for (const server of [3, 1]) {
    for (const broken of breaks) {
      const next = structuredClone(previous);
      broken(next);
      assert.throws(
        () => prepareVersionedWorkspaceSave(previous, next, "owner-1", server),
        (error) => error instanceof WorkspaceProtocolError && error.code === "SS_CURRENCY_CONTRACT",
        server,
      );
    }
  }
});

test("protocol 1 only saves lira, as schemaVersion 1; other protocols are refused", () => {
  const previous = normalizeLoadedWorkspace(legacyLoaded());
  for (const protocol of [2, 0, 4])
    assert.throws(
      () => prepareVersionedWorkspaceSave(previous, previous, "owner-1", protocol),
      (error) =>
        error instanceof WorkspaceProtocolError && error.code === "SS_PROTOCOL_UNSUPPORTED",
    );
  for (const server of [1]) {
    const { payload } = prepareVersionedWorkspaceSave(previous, previous, "owner-1", server);
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.entries[0].currency, "TRY"); // kept, not stripped
    for (const foreign of [
      (w) => (w.entries[0].currency = "USD"),
      (w) => (w.goals[0].currency = "EUR"),
      (w) => (w.analyses[0].purchase.currency = "USD"),
      (w) => (w.waiting[0].currency = "EUR"),
      (w) => (w.profile.displayCurrency = "USD"),
    ]) {
      const next = structuredClone(previous);
      foreign(next);
      assert.throws(
        () => prepareVersionedWorkspaceSave(previous, next, "owner-1", server),
        (error) =>
          error instanceof WorkspaceProtocolError && error.code === "SS_PROTOCOL_UNSUPPORTED",
      );
    }
  }
});

test("explicit deletion intent and history handling are identical to the existing protocol", () => {
  const previous = normalizeLoadedWorkspace(v3Loaded());
  const next = { ...previous, entries: [], goals: [], decisions: [], waiting: [] };
  const legacy = prepareWorkspaceSave(previous, next, "owner-1");
  const versioned = prepareVersionedWorkspaceSave(previous, next, "owner-1", 3);
  assert.deepEqual(versioned.payload.deletions, legacy.payload.deletions);
  assert.deepEqual(versioned.payload.deletions, {
    entries: ["entry-1"],
    goals: ["goal-1"],
    analyses: [],
    decisions: ["decision-1"],
    waiting: ["waiting-1"],
    reflections: ["decision-1"],
  });
  assert.deepEqual(versioned.workspace, legacy.workspace);
  // The deleted goal's live reference is cleared; the historical snapshot is kept.
  assert.equal(versioned.workspace.analyses[0].goalId, undefined);
  assert.deepEqual(versioned.workspace.analyses[0].result, previous.analyses[0].result);
  // Ordinary saves still carry no deletion intent.
  const same = prepareVersionedWorkspaceSave(previous, structuredClone(previous), "o", 3);
  assert.ok(Object.values(same.payload.deletions).every((ids) => ids.length === 0));
  // The existing (version 1) serializer is unchanged.
  assert.equal(legacy.payload.schemaVersion, 1);
});

test("error codes map to safe, translatable messages without server details", () => {
  assert.equal(
    persistenceMessage({ code: "0A000", message: "SQL detail" }),
    UPDATE_REQUIRED_MESSAGE,
  );
  assert.equal(
    UPDATE_REQUIRED_MESSAGE,
    "A newer version of the app is available. Please update the app to keep your data safe.",
  );
  assert.equal(
    persistenceMessage(new WorkspaceProtocolError("SS_PROTOCOL_UNSUPPORTED", "x")),
    CURRENCY_UNSUPPORTED_MESSAGE,
  );
  assert.match(
    persistenceMessage(new WorkspaceProtocolError("SS_CURRENCY_CONTRACT", "x")),
    /incomplete or invalid/,
  );
  // Existing mappings are unchanged, including optimistic-lock conflicts.
  assert.match(persistenceMessage({ code: "40001" }), /changed in another session/);
  assert.match(persistenceMessage({ code: "22023" }), /incomplete or invalid/);
  assert.match(persistenceMessage({ code: "42501" }), /sign in again/);
  // A missing RPC (for example load_workspace_v3 before the migration) fails safely.
  for (const code of ["PGRST202", "42883"])
    assert.match(persistenceMessage({ code }), /database setup is not ready/);
  assert.match(persistenceMessage(new Error("boom")), /could not be saved/);
});

test("profiles default to TRY display currency and keep the symbol/code preference", () => {
  assert.equal(emptyProfile.displayCurrency, "TRY");
  assert.equal(emptyProfile.currency, "symbol");
  const workspace = emptyWorkspace("new@example.com");
  assert.equal(workspace.profile.displayCurrency, "TRY");
  const { payload } = prepareVersionedWorkspaceSave(workspace, workspace, "owner", 1);
  assert.equal(payload.schemaVersion, 1); // a brand-new lira account saves on either database
});

test("a bought purchase becomes an expense in the purchase's own currency", () => {
  const purchase = { ...legacyLoaded().analyses[0].purchase, price: 120, currency: "USD" };
  const entry = purchaseEntry(purchase);
  assert.deepEqual([entry.type, entry.amount, entry.currency], ["expense", 120, "USD"]);
  assert.equal(purchaseEntry({ ...purchase, currency: "TRY" }).currency, "TRY");
});

test("TRY-only data behaves exactly as before, including the analysis", () => {
  const workspace = normalizeLoadedWorkspace(legacyLoaded());
  const purchase = workspace.analyses[0].purchase;
  const inputs = toAnalysisInputs(purchase, workspace.goals[0], workspace.entries, null);
  assert.equal(inputs.ok, true);
  assert.equal(inputs.converted, false);
  assert.deepEqual(
    analyze(inputs.purchase, workspace.profile, inputs.goal, inputs.entries),
    analyze(purchase, workspace.profile, workspace.goals[0], workspace.entries),
  );
});

test("the Decide boundary converts other currencies to lira with one snapshot, or refuses", () => {
  const rates = validateRateSnapshot(
    {
      source: "TCMB",
      bulletin: "2026/166",
      date: "2026-09-04",
      rates: {
        USD: { buying: "48.2326", selling: "48.3195" },
        EUR: { buying: "56.0571", selling: "56.1581" },
      },
    },
    new Date("2026-09-07T00:00:00Z"),
  ).rates;
  const workspace = normalizeLoadedWorkspace(legacyLoaded());
  const purchase = { ...workspace.analyses[0].purchase, price: 100, currency: "USD" };
  const goal = { ...workspace.goals[0], target: 1000, saved: 100, currency: "EUR" };
  const before = structuredClone({ purchase, goal });
  const inputs = toAnalysisInputs(purchase, goal, workspace.entries, rates);
  assert.equal(inputs.ok, true);
  assert.equal(inputs.converted, true);
  assert.deepEqual([inputs.purchase.price, inputs.purchase.currency], [4827.61, "TRY"]);
  assert.deepEqual([inputs.goal.target, inputs.goal.saved], [56107.6, 5610.76]);
  assert.deepEqual({ purchase, goal }, before); // originals untouched
  // Scoring is the unchanged analyze() on lira values: same as entering 4827.61 TRY.
  assert.deepEqual(
    analyze(inputs.purchase, workspace.profile, inputs.goal, inputs.entries),
    analyze(
      { ...purchase, price: 4827.61, currency: "TRY" },
      workspace.profile,
      inputs.goal,
      workspace.entries,
    ),
  );
  assert.deepEqual(toAnalysisInputs(purchase, goal, workspace.entries, null), {
    ok: false,
    reason: "missing-rate",
  });
});
