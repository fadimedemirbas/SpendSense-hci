import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  WorkspaceProtocolError,
  assertLoadedWorkspace,
  normalizeLoadedWorkspace,
  prepareVersionedWorkspaceSave,
  workspaceLoadRequest,
} from "../src/lib/workspaceProtocol.ts";
import { emptyWorkspace, persistenceMessage } from "../src/lib/workspace.ts";
import { profileTubes } from "../src/store.ts";
import {
  MIGRATION_1,
  MIGRATION_2,
  addUser,
  as,
  createDatabase,
  migrationSql,
  runSql,
} from "./support/spendsense-db.mjs";

// Savings holdings (migration 202611010001, client protocol 4) on local PGlite
// databases. Nothing touches a remote database.

const MIGRATION_3 = "202611010001_spendsense_holdings.sql";
const rollback = () =>
  readFile(
    new URL(
      "../../supabase/rollback/202611010001_spendsense_holdings_rollback.sql",
      import.meta.url,
    ),
    "utf8",
  );
/** A script that must fail; its transaction is closed so the database stays usable. */
async function refused(db, sql, message) {
  await assert.rejects(runSql(db, sql), message);
  await db.exec("rollback");
}
const migrated = () => createDatabase([MIGRATION_1, MIGRATION_2, MIGRATION_3]);

/** A browser session with a fixed client protocol, like useWorkspace with CLIENT_PROTOCOL. */
function session(db, userId, protocol) {
  const state = { workspace: null, revision: 0 };
  return {
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
      state.workspace = data
        ? loaded
        : { ...loaded, profile: { ...loaded.profile, habits: [0, 1, 2, 0], onboarded: true } };
      state.revision = data?.revision ?? 0;
      return data;
    },
    async save(change) {
      await as(db, userId);
      const { workspace, payload } = prepareVersionedWorkspaceSave(
        state.workspace,
        change(structuredClone(state.workspace)),
        userId,
        protocol,
      );
      const behaviorScores = Object.fromEntries(profileTubes(workspace.profile.habits));
      const result = await db.query(
        "select public.spendsense_save_workspace($1::jsonb,$2::bigint) as revision",
        [JSON.stringify({ ...payload, behaviorScores }), state.revision],
      );
      state.workspace = workspace;
      state.revision = result.rows[0].revision;
      return payload;
    },
  };
}
const holding = (fields) => ({ id: randomUUID(), name: "Saved", date: "2026-10-30", ...fields });
const HOLDINGS = () => [
  holding({ kind: "Salary surplus", quantity: 5000.5, unit: "TRY", name: "October" }),
  holding({ kind: "Gold", quantity: 12.5, unit: "g", price: 3100, priceCurrency: "TRY" }),
  holding({ kind: "Silver", quantity: 250, unit: "g" }),
  holding({
    kind: "Crypto",
    quantity: 0.00012345,
    unit: "BTC",
    price: 68000,
    priceCurrency: "USD",
  }),
  holding({ kind: "Other", quantity: 200, unit: "EUR" }),
];
const byId = (list) => [...list].sort((a, b) => a.id.localeCompare(b.id));
const entry = () => ({
  id: randomUUID(),
  type: "income",
  amount: 30000,
  currency: "TRY",
  cat: "Salary",
  name: "Pay",
  date: "2026-10-30",
});

test("protocol 4 saves, reloads, edits and deletes holdings exactly", async () => {
  const db = await migrated();
  try {
    const user = await addUser(db);
    const app = session(db, user, 4);
    await app.load();
    const holdings = HOLDINGS();
    const payload = await app.save((w) => ({ ...w, entries: [entry()], holdings }));
    assert.equal(payload.schemaVersion, 4);
    assert.deepEqual(payload.deletions.holdings, []);
    const data = await app.load();
    assert.equal(data.protocol, 4);
    assert.deepEqual(byId(app.state.workspace.holdings), byId(holdings));
    assert.equal(app.state.workspace.entries.length, 1);

    // Edit one, delete another: the deletion is explicit and nothing else changes.
    const [surplus, gold] = holdings;
    const edited = { ...gold, quantity: 15, price: undefined, priceCurrency: undefined };
    delete edited.price;
    delete edited.priceCurrency;
    const second = await app.save((w) => ({
      ...w,
      holdings: w.holdings
        .filter((h) => h.id !== surplus.id)
        .map((h) => (h.id === gold.id ? edited : h)),
    }));
    assert.deepEqual(second.deletions.holdings, [surplus.id]);
    await app.load();
    assert.equal(app.state.workspace.holdings.length, 4);
    assert.deepEqual(
      app.state.workspace.holdings.find((h) => h.id === gold.id),
      edited,
    );
  } finally {
    await db.close();
  }
});

test("protocol 3 clients never see holdings and their saves leave them untouched", async () => {
  const db = await migrated();
  try {
    const user = await addUser(db);
    const modern = session(db, user, 4);
    const older = session(db, user, 3);
    await modern.load();
    const holdings = HOLDINGS();
    await modern.save((w) => ({ ...w, holdings }));
    const data = await older.load();
    assert.equal(data.workspace.holdings, undefined);
    assert.deepEqual(older.state.workspace.holdings, []);
    const payload = await older.save((w) => ({ ...w, entries: [entry()] }));
    assert.equal(payload.schemaVersion, 3);
    assert.equal("holdings" in payload, false);
    await modern.load();
    assert.deepEqual(byId(modern.state.workspace.holdings), byId(holdings));
    assert.equal(modern.state.workspace.entries.length, 1);
    // An older protocol refuses to save holdings instead of silently dropping them.
    assert.throws(
      () => prepareVersionedWorkspaceSave(older.state.workspace, modern.state.workspace, user, 3),
      (error) =>
        error instanceof WorkspaceProtocolError && error.code === "SS_HOLDINGS_UNSUPPORTED",
    );
    assert.match(
      persistenceMessage({ code: "SS_HOLDINGS_UNSUPPORTED" }),
      /not available in this app version/,
    );
  } finally {
    await db.close();
  }
});

test("the database refuses invalid holdings and other users' rows", async () => {
  const db = await migrated();
  try {
    const user = await addUser(db);
    const app = session(db, user, 4);
    await app.load();
    await app.save((w) => ({ ...w, holdings: HOLDINGS().slice(0, 1) }));
    const saved = structuredClone(app.state);
    for (const bad of [
      { kind: "Salary surplus", quantity: 10.123, unit: "TRY" }, // money keeps 2 decimals
      { kind: "Salary surplus", quantity: 10, unit: "g" },
      { kind: "Salary surplus", quantity: 10, unit: "TRY", price: 1, priceCurrency: "TRY" },
      { kind: "Gold", quantity: 1, unit: "kg" },
      { kind: "Gold", quantity: 0.000000001, unit: "g" },
      { kind: "Silver", quantity: 0, unit: "g" },
      { kind: "Crypto", quantity: 1, unit: "btc" },
      { kind: "Crypto", quantity: 1, unit: "BTC", price: 100 }, // price without currency
      { kind: "Crypto", quantity: 1, unit: "BTC", price: 100, priceCurrency: "GBP" },
      { kind: "Stocks", quantity: 1, unit: "TRY" },
    ]) {
      await assert.rejects(
        app.save((w) => ({ ...w, holdings: [...w.holdings, holding(bad)] })),
        (error) => error.code === "22023",
        JSON.stringify(bad),
      );
      Object.assign(app.state, structuredClone(saved));
    }
    // RLS: another account sees none of them and cannot delete them.
    const other = await addUser(db);
    const stranger = session(db, other, 4);
    await stranger.load();
    await stranger.save((w) => w);
    await stranger.load();
    assert.deepEqual(stranger.state.workspace.holdings, []);
    await as(db, other);
    const { rows } = await db.query(
      "select count(*)::int as n from public.spendsense_savings_holdings",
    );
    assert.equal(rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test("the migration needs 202610280001, runs once, and its rollback refuses while holdings exist", async () => {
  const early = await createDatabase([MIGRATION_1]);
  try {
    await refused(early, await migrationSql(MIGRATION_3), /must be applied first/);
  } finally {
    await early.close();
  }
  const db = await migrated();
  try {
    await refused(db, await migrationSql(MIGRATION_3), /already applied/);
    const user = await addUser(db);
    const app = session(db, user, 4);
    await app.load();
    await app.save((w) => ({ ...w, entries: [entry()], holdings: HOLDINGS() }));
    await refused(db, await rollback(), /holdings exist/);
    await app.load();
    assert.equal(app.state.workspace.holdings.length, 5); // nothing changed
    await app.save((w) => ({ ...w, holdings: [] }));
    await runSql(db, await rollback());
    // Back to 202610280001: protocol 3 still works and keeps its data; protocol 4 is gone.
    const older = session(db, user, 3);
    await older.load();
    assert.equal(older.state.workspace.entries.length, 1);
    await older.save((w) => w);
    await assert.rejects(app.load(), /spendsense_load_workspace_v4/);
    // And it can be applied again afterwards.
    await runSql(db, await migrationSql(MIGRATION_3));
    await app.load();
    assert.deepEqual(app.state.workspace.holdings, []);
  } finally {
    await db.close();
  }
});
