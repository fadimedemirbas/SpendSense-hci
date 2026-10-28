import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  WorkspaceProtocolError,
  assertLoadedWorkspace,
  detectServerProtocol,
  normalizeLoadedWorkspace,
  prepareVersionedWorkspaceSave,
} from "../src/lib/workspaceProtocol.ts";
import { persistenceMessage, UPDATE_REQUIRED_MESSAGE } from "../src/lib/workspace.ts";
import { profileTubes } from "../src/store.ts";

// The real frontend load/save path (useWorkspace without React) against local
// PGlite databases: one with only 202610250001 (today's production schema) and
// one with the proposed 202610280001 on top. Nothing touches a remote database.
const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);
const sql = (name) => readFile(new URL(name, MIGRATIONS), "utf8");
const AUTH_STUBS = `create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email','test@example.com') $$;
  grant usage on schema auth,public to anon,authenticated;
  grant execute on function auth.uid(),auth.jwt() to anon,authenticated;`;

async function database(migrations) {
  const db = new PGlite();
  await db.exec(AUTH_STUBS);
  for (const name of migrations) await db.exec(await sql(name));
  return db;
}

/** A browser session: load → assert → detect → normalise, and versioned saves. */
function session(db, userId) {
  const state = { workspace: null, revision: 0, protocol: "unknown" };
  const as = async () => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  };
  return {
    userId,
    state,
    async load() {
      await as();
      const data = (
        await db.query("select public.spendsense_load_workspace($1::uuid) as r", [userId])
      ).rows[0].r;
      if (data !== null) assertLoadedWorkspace(data);
      state.workspace = data
        ? normalizeLoadedWorkspace(data.workspace)
        : emptyLira("test@example.com");
      state.revision = data?.revision ?? 0;
      state.protocol = detectServerProtocol(data);
      return data;
    },
    async save(change, { revision = state.revision } = {}) {
      await as();
      const next = change(structuredClone(state.workspace));
      const { workspace, payload } = prepareVersionedWorkspaceSave(
        state.workspace,
        next,
        userId,
        state.protocol,
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
const emptyLira = (email) => ({
  profile: {
    email,
    income: 1,
    savings: 2,
    habits: [0, 1, 2, 0],
    onboarded: true,
    currency: "symbol",
    displayCurrency: "TRY",
  },
  entries: [],
  goals: [],
  waiting: [],
  decisions: [],
  analyses: [],
});
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

let current, migrated;
before(async () => {
  current = await database(["202610250001_spendsense.sql"]);
  migrated = await database([
    "202610250001_spendsense.sql",
    "202610280001_spendsense_currency.sql",
  ]);
});
after(async () => {
  await current.close();
  await migrated.close();
});
async function user(db) {
  const id = randomUUID();
  await db.exec("reset role");
  await db.query("insert into auth.users values ($1)", [id]);
  return session(db, id);
}

test("against today's database the app saves lira as schemaVersion 1 and refuses USD/EUR locally", async () => {
  const me = await user(current);
  assert.equal(await me.load(), null);
  assert.equal(me.state.protocol, "unknown");
  const first = await me.save((w) => withHistory(w));
  assert.equal(first.schemaVersion, 1);
  await me.load();
  assert.equal(me.state.protocol, "v1"); // no displayCurrency in the response
  assert.equal(me.state.workspace.entries[0].currency, "TRY");
  assert.equal(me.state.workspace.entries[0].amount, 500);
  // Ordinary lira edits keep working.
  await me.save((w) => ({ ...w, entries: w.entries.map((e) => ({ ...e, amount: 600 })) }));
  await me.load();
  assert.equal(me.state.workspace.entries[0].amount, 600);
  // USD/EUR or a non-TRY display currency is refused before any request: no fallback,
  // no stripping, nothing sent.
  const revision = me.state.revision;
  for (const change of [
    (w) => ({ ...w, entries: w.entries.map((e) => ({ ...e, currency: "USD" })) }),
    (w) => ({ ...w, goals: w.goals.map((g) => ({ ...g, currency: "EUR" })) }),
    (w) => ({ ...w, profile: { ...w.profile, displayCurrency: "EUR" } }),
  ]) {
    await assert.rejects(
      me.save(change),
      (error) =>
        error instanceof WorkspaceProtocolError && error.code === "SS_PROTOCOL_UNSUPPORTED",
    );
  }
  assert.equal((await me.load()).revision, revision);
  assert.equal(me.state.workspace.entries[0].currency, "TRY");
});

test("against the migrated database the app detects v2 and round-trips TRY/USD/EUR exactly", async () => {
  const me = await user(migrated);
  await me.load();
  const first = await me.save((w) => withHistory(w)); // new account: protocol not known yet
  assert.equal(first.schemaVersion, 1);
  await me.load();
  assert.equal(me.state.protocol, "v2");
  const payload = await me.save((w) =>
    withHistory({ ...w, profile: { ...w.profile, displayCurrency: "EUR" } }, "USD"),
  );
  assert.equal(payload.schemaVersion, 2);
  await me.load();
  const w = me.state.workspace;
  assert.equal(w.profile.displayCurrency, "EUR");
  assert.equal(w.profile.currency, "symbol");
  assert.deepEqual(w.entries.map((e) => [e.amount, e.currency]).sort(), [
    [500, "TRY"],
    [500, "USD"],
  ]);
  assert.deepEqual(w.goals.map((g) => [g.target, g.saved, g.currency]).sort(), [
    [1500, 250.5, "TRY"],
    [1500, 250.5, "USD"],
  ]);
  assert.deepEqual(w.waiting.map((item) => item.currency).sort(), ["TRY", "USD"]);
  // Saving again unchanged is accepted and changes nothing.
  const before = structuredClone(w);
  await me.save((x) => x);
  await me.load();
  assert.deepEqual(me.state.workspace, before);
});

test("legacy data written by today's frontend upgrades without touching analysis history", async () => {
  // Data saved before the migration existed, then the migration applied.
  const db = await database(["202610250001_spendsense.sql"]);
  try {
    const me = await user(db);
    await me.load();
    await me.save((w) => withHistory(w));
    await me.load();
    const history = structuredClone(me.state.workspace.analyses);
    await db.exec("reset role");
    await db.exec(await sql("202610280001_spendsense_currency.sql"));
    await me.load();
    assert.equal(me.state.protocol, "v2");
    const payload = await me.save((w) => w);
    assert.equal(payload.schemaVersion, 2);
    await me.load();
    const analyses = me.state.workspace.analyses;
    assert.deepEqual(
      analyses.map((a) => a.result),
      history.map((a) => a.result),
    );
    assert.deepEqual(
      analyses.map((a) => a.purchase),
      history.map((a) => a.purchase),
    );
    assert.equal(analyses[0].purchase.currency, "TRY");
    assert.equal(analyses[0].createdAt, history[0].createdAt);
  } finally {
    await db.close();
  }
});

test("explicit deletion, optimistic locking and the old-client error keep their behaviour", async () => {
  const me = await user(migrated);
  await me.load();
  await me.save((w) => withHistory(w));
  await me.load();
  // Explicit deletion of one entry through schemaVersion 2.
  await me.save((w) => ({ ...w, entries: [] }));
  await me.load();
  assert.equal(me.state.workspace.entries.length, 0);
  assert.equal(me.state.workspace.goals.length, 1);
  // A stale revision is rejected by the database (40001) and mapped as before.
  const stale = me.state.revision - 1;
  await assert.rejects(
    me.save((w) => w, { revision: stale }),
    (error) =>
      error.code === "40001" && /changed in another session/.test(persistenceMessage(error)),
  );
  // An outdated client (schemaVersion 1) on an account with USD data gets 0A000,
  // which the app shows as the update message — no SQL detail.
  await me.load();
  await me.save((w) => withHistory(w, "USD"));
  await me.load();
  const stalePayload = {
    ...me.state.workspace,
    ownerId: me.userId,
    schemaVersion: 1,
    behaviorScores: Object.fromEntries(profileTubes(me.state.workspace.profile.habits)),
    deletions: {
      entries: [],
      goals: [],
      analyses: [],
      decisions: [],
      waiting: [],
      reflections: [],
    },
  };
  const error = await migrated
    .query("select public.spendsense_save_workspace($1::jsonb,$2::bigint)", [
      JSON.stringify(stalePayload),
      me.state.revision,
    ])
    .catch((failure) => failure);
  assert.equal(error.code, "0A000");
  assert.equal(persistenceMessage(error), UPDATE_REQUIRED_MESSAGE);
  assert.doesNotMatch(persistenceMessage(error), /SQL|0A000|currenc/i);
});
