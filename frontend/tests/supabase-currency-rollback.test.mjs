import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { prepareWorkspaceSave } from "../src/lib/workspaceProtocol.ts";
import {
  MIGRATION_1,
  MIGRATION_2,
  NEW_FUNCTIONS,
  addUser,
  allRows,
  as,
  createDatabase,
  currencyColumns,
  failsWith,
  functionHashes,
  ledger,
  legacyFixture,
  loadLegacy,
  loadV3,
  migrationSql,
  rollbackSql,
  runSql,
  save,
  v3Of,
} from "./support/spendsense-db.mjs";

// supabase/rollback/202610280001_spendsense_currency_rollback.sql on local PGlite.

async function migratedWithData() {
  const db = await createDatabase([MIGRATION_1]);
  const baseline = await functionHashes(db);
  const users = [await addUser(db), await addUser(db)];
  for (const user of users) {
    await as(db, user);
    await save(db, user, legacyFixture(), 0);
  }
  await db.exec("reset role");
  const rowsBefore = await allRows(db);
  await db.exec(await migrationSql(MIGRATION_2));
  return { db, baseline, users, rowsBefore };
}
async function commitV3(db, user, change) {
  await as(db, user);
  const loaded = await loadV3(db, user);
  const next = change(v3Of(loaded.workspace));
  const { payload } = prepareWorkspaceSave(loaded.workspace, next, user);
  await save(db, user, { ...payload, schemaVersion: 3 }, loaded.revision, 3);
}

test("before any USD/EUR data, the rollback restores migration 1 exactly and keeps every row", async () => {
  const { db, baseline, users, rowsBefore } = await migratedWithData();
  try {
    // Protocol 3 saves of lira data in between (adds "currency":"TRY" keys and metadata).
    await commitV3(db, users[0], (w) => {
      w.analyses[0].result = {
        ...w.analyses[0].result,
        basis: "TRY",
        rates: { source: "TCMB", bulletin: "2026/166", date: "2026-09-04" },
      };
      w.entries.push({
        id: randomUUID(),
        type: "expense",
        amount: 99.99,
        currency: "TRY",
        cat: "Food",
        name: "Dinner",
        date: "2026-10-27",
      });
      return w;
    });
    await runSql(db, await rollbackSql());
    assert.deepEqual(await functionHashes(db), baseline); // identical to a migration-1 database
    assert.deepEqual(await currencyColumns(db), []);
    const remaining = Object.keys(await functionHashes(db));
    for (const name of NEW_FUNCTIONS) assert.ok(!remaining.includes(name), name);
    assert.deepEqual(
      (await ledger(db)).map((row) => [row.version, row.status]),
      [
        ["202610250001", "baseline-verified"],
        ["202610280001", "reverted"],
      ],
    );
    // Rows and amounts: the second user's rows are byte-identical; the first keeps its
    // amounts (plus the added lira entry) and its analysis history.
    const rows = await allRows(db);
    for (const table of Object.keys(rowsBefore))
      assert.ok(rows[table].length >= rowsBefore[table].length, table);
    assert.deepEqual(
      rows.money_entries.map((r) => r.amount).sort(),
      [32000.5, 32000.5, 99.99].sort(),
    );
    await as(db, users[1]);
    const other = await loadLegacy(db, users[1]);
    assert.equal(other.workspace.entries[0].amount, 32000.5);
    // Today's frontend works on the rolled-back database for both users.
    for (const user of users) {
      await as(db, user);
      const loaded = await loadLegacy(db, user);
      assert.ok(loaded.workspace.analyses[0].result.fit);
      await save(db, user, loaded.workspace, loaded.revision, 1);
    }
    // Anonymous access is still denied.
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query(`select public.spendsense_load_workspace('${users[0]}'::uuid)`), {
      code: "42501",
    });
    // The migration can be applied again afterwards.
    await runSql(db, await migrationSql(MIGRATION_2));
    assert.equal((await ledger(db)).at(-1).status, "applied");
    await as(db, users[0]);
    assert.equal((await loadV3(db, users[0])).workspace.entries.length, 2);
  } finally {
    await db.close();
  }
});

test("the rollback is refused while any USD/EUR data or display currency exists", async () => {
  const { db, users } = await migratedWithData();
  try {
    const cases = {
      "money entry": (w) => (w.entries[0].currency = "USD"),
      "savings goal": (w) => (w.goals[0].currency = "EUR"),
      "analysis purchase": (w) => (w.analyses[0].purchase.currency = "USD"),
      "goal snapshot in analysis history": (w) => (w.analyses[0].result.goal.currency = "EUR"),
      "decision purchase": (w) => (w.decisions[0].currency = "USD"),
      "waiting-list purchase": (w) => (w.waiting[0].currency = "EUR"),
      "display currency": (w) => (w.profile.displayCurrency = "USD"),
    };
    for (const [label, make] of Object.entries(cases)) {
      await commitV3(db, users[1], (w) => (make(w), w));
      const hashes = await functionHashes(db);
      await failsWith(db, await rollbackSql(), "55000", /USD\/EUR data exists/);
      assert.deepEqual(await functionHashes(db), hashes, label);
      assert.equal((await currencyColumns(db)).length, 3, label);
      assert.equal((await ledger(db)).at(-1).status, "applied", label);
      // Back to lira for the next case.
      await commitV3(db, users[1], (w) => {
        for (const record of [...w.entries, ...w.goals, ...w.decisions, ...w.waiting])
          record.currency = "TRY";
        for (const analysis of w.analyses) {
          analysis.purchase.currency = "TRY";
          if (analysis.result.goal) delete analysis.result.goal.currency;
        }
        w.profile.displayCurrency = "TRY";
        return w;
      });
    }
  } finally {
    await db.close();
  }
});

test("the rollback is refused when the migration is not recorded as applied", async () => {
  const db = await createDatabase([MIGRATION_1]);
  try {
    await failsWith(db, await rollbackSql(), "55000", /not recorded as applied/);
    const migrated = await createDatabase([MIGRATION_1, MIGRATION_2]);
    try {
      await runSql(migrated, await rollbackSql());
      await failsWith(migrated, await rollbackSql(), "55000", /not recorded as applied/);
    } finally {
      await migrated.close();
    }
  } finally {
    await db.close();
  }
});
