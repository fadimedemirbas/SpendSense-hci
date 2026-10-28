import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  AUTH_STUBS,
  MIGRATION_1,
  MIGRATION_2,
  addUser,
  as,
  currencyColumns,
  failsWith,
  functionHashes,
  ledger,
  legacyFixture,
  loadLegacy,
  loadV3,
  migrationSql,
  rollbackSql,
  save,
} from "./support/spendsense-db.mjs";

// The PGlite session user is a superuser, which bypasses RLS and hides exactly the
// problem these tests are about. Here migration 1 and the currency migration are
// run by ordinary (non-superuser) roles, as on Supabase where the SQL Editor role
// "postgres" is not a superuser but has BYPASSRLS.

/** A database whose SpendSense tables are owned by `owner` (created with `attributes`). */
async function databaseOwnedBy(owner, attributes) {
  const db = new PGlite();
  await db.exec(AUTH_STUBS);
  await db.exec(`create role ${owner} nosuperuser ${attributes};
    grant usage, create on schema public to ${owner};
    grant usage on schema auth to ${owner};
    grant select, references on auth.users to ${owner};
    grant execute on function auth.uid(), auth.jwt() to ${owner};
    do $$ begin execute format('grant create on database %I to ${owner}', current_database()); end $$;`);
  await db.exec(`set role ${owner}`);
  await db.exec(await migrationSql(MIGRATION_1));
  await db.exec("reset role");
  return db;
}
async function runAs(db, role, sql) {
  await db.exec(`reset role; set role ${role}`);
  try {
    await db.exec(sql);
  } finally {
    await db.exec("reset role");
  }
}
async function seed(db) {
  const user = await addUser(db);
  await as(db, user);
  await save(db, user, legacyFixture(), 0);
  await db.exec("reset role");
  return user;
}

test("a non-superuser owner without BYPASSRLS is refused before anything changes", async () => {
  const db = await databaseOwnedBy("limited_owner", "nobypassrls");
  try {
    await seed(db);
    const hashes = await functionHashes(db);
    await failsWith(
      db,
      `set role limited_owner; ${await migrationSql(MIGRATION_2)}`,
      "42501",
      /bypasses RLS/,
    );
    assert.deepEqual(await currencyColumns(db), []);
    assert.equal(await ledger(db), null);
    assert.deepEqual(await functionHashes(db), hashes);
  } finally {
    await db.close();
  }
});

test("row_security = off turns a silently filtered check into an error (defence in depth)", async () => {
  const db = await databaseOwnedBy("limited_owner", "nobypassrls");
  try {
    await seed(db);
    // Without the setting, FORCE RLS makes the owner see no rows at all: a check would pass.
    await db.exec("set role limited_owner");
    const silent = await db.query("select count(*)::int as n from public.spendsense_money_entries");
    assert.equal(silent.rows[0].n, 0);
    await db.exec("reset role");
    // With it (as the migration sets it), the same query fails instead.
    await failsWith(
      db,
      `begin; set local role limited_owner; set local row_security = off;
       select count(*) from public.spendsense_money_entries;`,
      "42501",
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});

test("a non-superuser owner with BYPASSRLS (Supabase SQL Editor) migrates and sees every row", async () => {
  const db = await databaseOwnedBy("editor_owner", "bypassrls");
  try {
    const user = await seed(db);
    await as(db, user);
    const before = await loadLegacy(db, user);
    await runAs(db, "editor_owner", await migrationSql(MIGRATION_2));
    assert.deepEqual(await currencyColumns(db), [
      "spendsense_money_entries.currency",
      "spendsense_savings_goals.currency",
      "spendsense_user_profiles.display_currency",
    ]);
    assert.deepEqual(
      (await ledger(db)).map((row) => [row.version, row.status, row.recorded_by]),
      [
        ["202610250001", "baseline-verified", "editor_owner"],
        ["202610280001", "applied", "editor_owner"],
      ],
    );
    await as(db, user);
    assert.deepEqual(await loadLegacy(db, user), before);
    assert.equal((await loadV3(db, user)).workspace.entries[0].currency, "TRY");
    // A second run by the same role is refused by the ledger.
    await failsWith(
      db,
      `set role editor_owner; ${await migrationSql(MIGRATION_2)}`,
      "55000",
      /already applied/,
    );
  } finally {
    await db.close();
  }
});

test("with BYPASSRLS the data preflight really inspects other users' rows", async () => {
  const db = await databaseOwnedBy("editor_owner", "bypassrls");
  try {
    const user = await addUser(db);
    const workspace = legacyFixture();
    workspace.analyses[0].purchase.currency = "GBP"; // accepted by migration 1's validator
    await as(db, user);
    await save(db, user, workspace, 0);
    await failsWith(
      db,
      `set role editor_owner; ${await migrationSql(MIGRATION_2)}`,
      "23514",
      /currency rules/,
    );
    assert.deepEqual(await currencyColumns(db), []);
  } finally {
    await db.close();
  }
});

test("a role that bypasses RLS but does not own the tables is refused", async () => {
  const db = new PGlite();
  try {
    await db.exec(AUTH_STUBS);
    await db.exec(await migrationSql(MIGRATION_1)); // owned by the superuser session user
    await db.exec(
      "create role outsider nosuperuser bypassrls; grant usage on schema public to outsider;",
    );
    await failsWith(
      db,
      `set role outsider; ${await migrationSql(MIGRATION_2)}`,
      "42501",
      /is owned by .*not by the migration role outsider/,
    );
    assert.deepEqual(await currencyColumns(db), []);
  } finally {
    await db.close();
  }
});

test("the rollback applies the same role rules", async () => {
  const db = await databaseOwnedBy("editor_owner", "bypassrls");
  try {
    await seed(db);
    await runAs(db, "editor_owner", await migrationSql(MIGRATION_2));
    await db.exec(
      "create role limited_member nosuperuser nobypassrls; grant editor_owner to limited_member;",
    );
    await failsWith(db, `set role limited_member; ${await rollbackSql()}`, "42501", /bypasses RLS/);
    assert.equal((await ledger(db)).at(-1).status, "applied");
    await runAs(db, "editor_owner", await rollbackSql());
    assert.deepEqual(await currencyColumns(db), []);
    assert.equal((await ledger(db)).at(-1).status, "reverted");
  } finally {
    await db.close();
  }
});
