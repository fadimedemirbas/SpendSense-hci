import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  WorkspaceProtocolError,
  assertLoadedWorkspace,
  normalizeLoadedWorkspace,
  prepareVersionedWorkspaceSave,
  workspaceLoadRequest,
} from "../src/lib/workspaceProtocol.ts";
import {
  UPDATE_REQUIRED_MESSAGE,
  emptyWorkspace,
  persistenceMessage,
} from "../src/lib/workspace.ts";
import { profileTubes } from "../src/store.ts";
import {
  MIGRATION_1,
  MIGRATION_2,
  addUser,
  as,
  createDatabase,
  migrationSql,
} from "./support/spendsense-db.mjs";

// The real frontend load/save path (useWorkspace without React) for client protocols
// 1 and 3 against local PGlite databases: migration 1 only (today's production
// schema) and migration 1 + the currency migration. Nothing touches a remote database.

/** A browser session with a fixed client protocol, like useWorkspace with CLIENT_PROTOCOL. */
function session(db, userId, protocol) {
  const state = { workspace: null, revision: 0 };
  return {
    userId,
    state,
    async load() {
      await as(db, userId);
      const { fn, args } = workspaceLoadRequest(protocol, userId);
      const params = Object.values(args);
      const placeholders = params.map((_, i) => `$${i + 1}`).join(",");
      const data = (await db.query(`select public.${fn}(${placeholders}) as r`, params)).rows[0].r;
      if (data !== null) assertLoadedWorkspace(data, protocol);
      const loaded = data
        ? normalizeLoadedWorkspace(data.workspace)
        : emptyWorkspace("test@example.com");
      // A new account starts as an onboarded profile, as after the onboarding screens.
      state.workspace = data
        ? loaded
        : { ...loaded, profile: { ...loaded.profile, habits: [0, 1, 2, 0], onboarded: true } };
      state.revision = data?.revision ?? 0;
      return data;
    },
    async save(change, { revision = state.revision } = {}) {
      await as(db, userId);
      const next = change(structuredClone(state.workspace));
      const { workspace, payload } = prepareVersionedWorkspaceSave(
        state.workspace,
        next,
        userId,
        protocol,
      );
      const behaviorScores =
        workspace.profile.habits.length === 4
          ? Object.fromEntries(profileTubes(workspace.profile.habits))
          : {};
      const result = await db.query(
        "select public.spendsense_save_workspace($1::jsonb,$2::bigint) as revision",
        [JSON.stringify({ ...payload, behaviorScores }), revision],
      );
      state.workspace = workspace;
      state.revision = result.rows[0].revision;
      return payload;
    },
  };
}
const purchase = (currency = "TRY") => ({
  name: "Headphones",
  price: 120,
  currency,
  cat: "Shopping",
  reasons: ["need"],
  feeling: "Calm",
  own: false,
  wait: "3d",
});
function withHistory(workspace, currency = "TRY") {
  const goal = {
    id: randomUUID(),
    name: "Trip",
    target: 1500,
    saved: 250.5,
    currency,
    status: "Active",
  };
  const analysisId = randomUUID();
  const result = {
    budget: 17,
    need: 24,
    goalImpact: 4,
    impulse: 3,
    fit: 84,
    income: 22500,
    pctIncome: 11,
    pctGoal: 7,
    delayDays: 21,
    goal: { ...goal },
  };
  return {
    ...workspace,
    entries: [
      ...workspace.entries,
      {
        id: randomUUID(),
        type: "income",
        amount: 500,
        currency,
        cat: "Freelance",
        name: "Client",
        date: "2026-10-26",
      },
    ],
    goals: [...workspace.goals, goal],
    analyses: [
      ...workspace.analyses,
      {
        id: analysisId,
        purchase: purchase(currency),
        result,
        goalId: goal.id,
        createdAt: "2026-10-26T10:00:00Z",
      },
    ],
    decisions: [
      ...workspace.decisions,
      {
        ...purchase(currency),
        id: randomUUID(),
        analysisId,
        decision: "Wait",
        date: "2026-10-26",
        fit: 84,
        reflection: 4,
      },
    ],
    waiting: [
      ...workspace.waiting,
      {
        ...purchase(currency),
        id: randomUUID(),
        analysisId,
        added: "2026-10-26",
        review: "2026-10-29",
        fit: 84,
      },
    ],
  };
}
const expectCode = (code) => (error) => {
  assert.equal(error.code, code);
  return true;
};

test("protocol 1 on today's database: lira works, USD/EUR is refused locally, v3 is unavailable", async () => {
  const db = await createDatabase([MIGRATION_1]);
  try {
    const me = session(db, await addUser(db), 1);
    assert.equal(await me.load(), null);
    const first = await me.save((w) => withHistory(w));
    assert.equal(first.schemaVersion, 1);
    await me.load();
    assert.equal(me.state.workspace.entries[0].currency, "TRY"); // normalised at the boundary
    await me.save((w) => ({ ...w, entries: w.entries.map((e) => ({ ...e, amount: 600 })) }));
    await me.load();
    assert.equal(me.state.workspace.entries[0].amount, 600);
    const revision = me.state.revision;
    for (const change of [
      (w) => ({ ...w, entries: w.entries.map((e) => ({ ...e, currency: "USD" })) }),
      (w) => ({ ...w, goals: w.goals.map((g) => ({ ...g, currency: "EUR" })) }),
      (w) => ({ ...w, profile: { ...w.profile, displayCurrency: "EUR" } }),
    ])
      await assert.rejects(
        me.save(change),
        (error) =>
          error instanceof WorkspaceProtocolError && error.code === "SS_PROTOCOL_UNSUPPORTED",
      );
    assert.equal((await me.load()).revision, revision); // nothing was sent
    // A protocol 3 build against an unmigrated database fails safely (missing RPC).
    const modern = session(db, me.userId, 3);
    const error = await modern.load().catch((failure) => failure);
    assert.equal(error.code, "42883");
    assert.match(persistenceMessage(error), /database setup is not ready/);
  } finally {
    await db.close();
  }
});

test("protocol 1 and protocol 3 on the migrated database, including the old-client guard", async () => {
  const db = await createDatabase([MIGRATION_1, MIGRATION_2]);
  try {
    const user = await addUser(db);
    const legacy = session(db, user, 1);
    const modern = session(db, user, 3);
    await legacy.load();
    await legacy.save((w) => withHistory(w)); // a new account starts with a protocol 1 save
    // Protocol 3 sees the same data with explicit currencies and adds USD/EUR.
    await modern.load();
    assert.equal(modern.state.workspace.entries[0].currency, "TRY");
    const payload = await modern.save((w) =>
      withHistory({ ...w, profile: { ...w.profile, displayCurrency: "EUR" } }, "USD"),
    );
    assert.equal(payload.schemaVersion, 3);
    await modern.load();
    const w = modern.state.workspace;
    assert.equal(w.profile.displayCurrency, "EUR");
    assert.deepEqual(w.entries.map((e) => [e.amount, e.currency]).sort(), [
      [500, "TRY"],
      [500, "USD"],
    ]);
    assert.deepEqual(w.goals.map((g) => [g.target, g.saved, g.currency]).sort(), [
      [1500, 250.5, "TRY"],
      [1500, 250.5, "USD"],
    ]);
    // The TRY-only client can no longer load (0A000 → update message, no empty workspace)
    // and its earlier snapshot cannot be saved.
    const loadError = await legacy.load().catch((failure) => failure);
    assert.equal(loadError.code, "0A000");
    assert.equal(persistenceMessage(loadError), UPDATE_REQUIRED_MESSAGE);
    await assert.rejects(
      legacy.save((x) => x),
      expectCode("0A000"),
    );
    await modern.load();
    assert.deepEqual(modern.state.workspace, w); // nothing changed
    // Unchanged protocol 3 saves round-trip exactly.
    await modern.save((x) => x);
    await modern.load();
    assert.deepEqual(modern.state.workspace, w);
  } finally {
    await db.close();
  }
});

test("legacy data upgrades through protocol 3 without touching analysis history", async () => {
  const db = await createDatabase([MIGRATION_1]);
  try {
    const user = await addUser(db);
    const legacy = session(db, user, 1);
    await legacy.load();
    await legacy.save((w) => withHistory(w));
    await legacy.load();
    const history = structuredClone(legacy.state.workspace.analyses);
    await db.exec("reset role");
    await db.exec(await migrationSql(MIGRATION_2));
    const modern = session(db, user, 3);
    await modern.load();
    const payload = await modern.save((w) => w);
    assert.equal(payload.schemaVersion, 3);
    await modern.load();
    const analyses = modern.state.workspace.analyses;
    assert.deepEqual(
      analyses.map((a) => a.result),
      history.map((a) => a.result),
    );
    assert.deepEqual(
      analyses.map((a) => a.purchase),
      history.map((a) => a.purchase),
    );
    assert.equal(analyses[0].createdAt, history[0].createdAt);
    // Still lira only: the TRY-only client keeps working after the upgrade.
    await legacy.load();
    await legacy.save((w) => w);
  } finally {
    await db.close();
  }
});

test("explicit deletion and optimistic locking keep their behaviour under protocol 3", async () => {
  const db = await createDatabase([MIGRATION_1, MIGRATION_2]);
  try {
    const me = session(db, await addUser(db), 3);
    await me.load();
    await me.save((w) => withHistory(w));
    await me.load();
    await me.save((w) => ({ ...w, entries: [] }));
    await me.load();
    assert.equal(me.state.workspace.entries.length, 0);
    assert.equal(me.state.workspace.goals.length, 1);
    await assert.rejects(
      me.save((w) => w, { revision: me.state.revision - 1 }),
      (error) =>
        error.code === "40001" && /changed in another session/.test(persistenceMessage(error)),
    );
  } finally {
    await db.close();
  }
});
