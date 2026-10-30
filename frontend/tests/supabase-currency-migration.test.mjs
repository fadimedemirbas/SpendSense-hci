import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { prepareWorkspaceSave } from "../src/lib/workspaceProtocol.ts";
import {
  MIGRATION_1,
  MIGRATION_2,
  NEW_FUNCTIONS,
  TABLES,
  COLLECTIONS,
  addUser,
  allRows,
  as,
  createDatabase,
  currencyColumns,
  deletionList,
  failsWith,
  functionHashes,
  ledger,
  legacyFixture,
  loadLegacy,
  loadV3,
  migrationSql,
  save,
  v3Of,
} from "./support/spendsense-db.mjs";

// Migration 202610250001 (as deployed) with data saved by the current protocol 1
// frontend, then the proposed 202610280001 on top. Local PGlite only.
let db;
let users;
let saved;
let revisions;
let report;

async function asUser(index) {
  await as(db, users[index]);
}
async function saveAs(index, payload, { version = 1, revision = revisions[index] } = {}) {
  await asUser(index);
  revisions[index] = await save(db, users[index], payload, revision, version);
  return revisions[index];
}
async function legacy(index) {
  await asUser(index);
  return loadLegacy(db, users[index]);
}
async function v3(index) {
  await asUser(index);
  return loadV3(db, users[index]);
}
/** Saves with the real frontend deletion protocol, as schemaVersion 1 or 3. */
async function commit(index, next, version = 3) {
  const previous = (version === 3 ? await v3(index) : await legacy(index)).workspace;
  const { payload } = prepareWorkspaceSave(previous, next, users[index]);
  return saveAs(index, { ...payload, schemaVersion: version }, { version });
}
/** Rejected with `code` and nothing visible to either protocol changed. */
async function unchanged(index, payload, code, { version = 1, revision } = {}) {
  await asUser(index);
  const before = await loadV3(db, users[index]);
  await assert.rejects(
    save(db, users[index], payload, revision === undefined ? revisions[index] : revision, version),
    { code },
  );
  assert.deepEqual(await loadV3(db, users[index]), before);
}

before(async () => {
  db = await createDatabase([MIGRATION_1]);
  users = [await addUser(db), await addUser(db), await addUser(db)];
  saved = [legacyFixture(), legacyFixture()];
  revisions = [0, 0, 0];
  for (let i = 0; i < 2; i++) await saveAs(i, saved[i], { revision: 0 });
  const beforeRows = await allRows(db);
  const beforeLoads = [await legacy(0), await legacy(1)];
  await db.exec("reset role");
  await db.exec(await migrationSql(MIGRATION_2));
  report = {
    beforeRows,
    beforeLoads,
    afterRows: await allRows(db, {
      money_entries: ["currency"],
      savings_goals: ["currency"],
      user_profiles: ["display_currency"],
    }),
    afterRaw: await allRows(db),
    afterLegacy: [await legacy(0), await legacy(1)],
    afterV3: [await v3(0), await v3(1)],
    ledger: await ledger(db),
  };
});
beforeEach(async () => {
  await db.exec("reset role");
  for (const table of [
    "purchase_reflections",
    "waiting_items",
    "purchase_decisions",
    "purchase_analyses",
    "spending_profiles",
    "savings_goals",
    "money_entries",
    "user_profiles",
  ])
    await db.exec("delete from public.spendsense_" + table);
  saved = [legacyFixture(), legacyFixture()];
  revisions = [0, 0, 0];
  for (let i = 0; i < 2; i++) await saveAs(i, saved[i], { revision: 0 });
});
after(async () => await db.close());

test("existing rows, amounts, revisions and history survive the migration unchanged", () => {
  for (const table of TABLES) {
    assert.equal(report.afterRows[table].length, report.beforeRows[table].length, table);
    assert.deepEqual(report.afterRows[table], report.beforeRows[table], table);
  }
  assert.deepEqual(
    report.afterRaw.money_entries.map((row) => [row.amount, row.currency]),
    [
      [32000.5, "TRY"],
      [32000.5, "TRY"],
    ],
  );
  for (const row of report.afterRaw.user_profiles) {
    assert.equal(row.display_currency, "TRY");
    assert.equal(row.currency, "symbol"); // the format preference keeps its meaning
  }
  // Protocol 1 clients receive exactly what migration 1 returned: no currency fields.
  assert.deepEqual(report.afterLegacy, report.beforeLoads);
  // Protocol 3 sees the same data with explicit currencies and the protocol marker.
  for (let i = 0; i < 2; i++) {
    const [old, next] = [report.beforeLoads[i], report.afterV3[i]];
    assert.equal(next.protocol, 3);
    assert.equal(next.revision, old.revision);
    assert.equal(next.workspace.profile.displayCurrency, "TRY");
    assert.deepEqual(
      next.workspace.entries,
      old.workspace.entries.map((e) => ({ ...e, currency: "TRY" })),
    );
    assert.deepEqual(
      next.workspace.goals,
      old.workspace.goals.map((g) => ({ ...g, currency: "TRY" })),
    );
    for (const key of ["analyses", "decisions", "waiting"])
      assert.deepEqual(next.workspace[key], old.workspace[key], key);
  }
  assert.deepEqual(
    report.ledger.map((row) => [row.version, row.status]),
    [
      ["202610250001", "baseline-verified"],
      ["202610280001", "applied"],
    ],
  );
});

test("schema: checked columns, untouched RLS and grants, private ledger, other tables preserved", async () => {
  assert.deepEqual(await currencyColumns(db), [
    "spendsense_money_entries.currency",
    "spendsense_savings_goals.currency",
    "spendsense_user_profiles.display_currency",
  ]);
  await db.exec("reset role");
  for (const table of TABLES) {
    const rls = (
      await db.query(
        "select relrowsecurity, relforcerowsecurity from pg_class where oid=('public.spendsense_'||$1)::regclass",
        [table],
      )
    ).rows[0];
    assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true }, table);
    const policies = (
      await db.query(
        "select policyname, qual, with_check from pg_policies where schemaname='public' and tablename=$1",
        [`spendsense_${table}`],
      )
    ).rows;
    assert.equal(policies.length, 1, table);
    assert.equal(policies[0].policyname, "owner_only");
    assert.match(policies[0].qual, /auth\.uid\(\)/);
    assert.match(policies[0].with_check, /auth\.uid\(\)/);
  }
  const volatility = Object.fromEntries(
    (
      await db.query(`select proname, provolatile from pg_proc
        where pronamespace='public'::regnamespace and proname like 'spendsense_%'`)
    ).rows.map((r) => [r.proname, r.provolatile]),
  );
  for (const name of ["json_currency", "valid_currency_field", "valid_goal", "valid_purchase"])
    assert.equal(volatility["spendsense_" + name], "i", name);
  for (const name of [
    "valid_workspace",
    "load_workspace",
    "load_workspace_v3",
    "has_foreign_currency",
  ])
    assert.equal(volatility["spendsense_" + name], "s", name);
  assert.equal(volatility.spendsense_save_workspace, "v");
  const checks = (
    await db.query(`select pg_get_constraintdef(oid) as d from pg_constraint
      where conrelid='public.spendsense_money_entries'::regclass and contype='c'`)
  ).rows.map((r) => r.d);
  assert.ok(checks.some((d) => d.includes("amount > (0)::numeric")));
  assert.ok(checks.some((d) => d.includes("'TRY'::text") && d.includes("'EUR'::text")));
  assert.equal(
    (await db.query("select value from public.existing_team_table")).rows[0].value,
    "preserved",
  );
  // The ledger is private: no API role can use the schema or read the table.
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(db.query("select * from spendsense_meta.schema_migrations"), {
      code: "42501",
    });
  }
  await db.exec("reset role");
  const privileges = (
    await db.query(`select has_schema_privilege(r, 'spendsense_meta', 'USAGE') as usage,
      has_table_privilege(r, 'spendsense_meta.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE') as tbl
      from unnest(array['anon','authenticated','service_role']) r`)
  ).rows;
  assert.ok(privileges.every((p) => !p.usage && !p.tbl));
  // Anonymous callers cannot use either load RPC or the helper.
  await db.exec("set role anon");
  for (const sql of [
    `select public.spendsense_load_workspace('${users[0]}'::uuid)`,
    `select public.spendsense_load_workspace_v3('${users[0]}'::uuid, 3)`,
    `select public.spendsense_has_foreign_currency('${users[0]}'::uuid)`,
  ])
    await assert.rejects(db.query(sql), { code: "42501" }, sql);
  await db.exec("reset role");
});

test("the expected baseline hashes in the migration are computed from migration 1 itself", async () => {
  const fresh = await createDatabase([MIGRATION_1]);
  try {
    const actual = await functionHashes(fresh);
    const sql = await migrationSql(MIGRATION_2);
    const embedded = Object.fromEntries(
      [...sql.matchAll(/"(spendsense_\w+)": "([0-9a-f]{32})"/g)].map((m) => [m[1], m[2]]),
    );
    assert.equal(Object.keys(actual).length, 14);
    assert.deepEqual(embedded, actual);
  } finally {
    await fresh.close();
  }
});

test("safety checks stop the migration atomically when assumptions do not hold", async () => {
  const sql = await migrationSql(MIGRATION_2);
  // Repeated execution on the migrated database.
  await failsWith(db, sql, "55000", /already applied/);
  assert.equal((await ledger(db)).length, 2);

  const cases = [
    [
      "a migration-1 function body differs",
      `create or replace function public.spendsense_valid_goal(v jsonb)
       returns boolean language sql immutable set search_path = '' as $$ select true $$;`,
      /spendsense_valid_goal differs from migration 202610250001/,
    ],
    [
      "a currency column already exists",
      "alter table public.spendsense_money_entries add column currency text",
      /Currency columns already exist/,
    ],
    [
      "a function of this migration already exists",
      `create function public.spendsense_json_currency(v jsonb) returns boolean language sql as $$ select true $$;`,
      /already exist/,
    ],
    [
      "row level security is not forced",
      "alter table public.spendsense_waiting_items no force row level security",
      /not enabled and forced on public.spendsense_waiting_items/,
    ],
    [
      "a baseline table is missing",
      "drop table public.spendsense_purchase_reflections",
      /spendsense_purchase_reflections is missing/,
    ],
    [
      "the ledger already lists the migration as applied",
      `create schema spendsense_meta; create table spendsense_meta.schema_migrations(version text primary key,
        name text, status text, recorded_at timestamptz default now(), recorded_by text default current_user, notes text);
       insert into spendsense_meta.schema_migrations(version, name, status) values ('202610280001','x','applied');`,
      /already applied/,
    ],
  ];
  for (const [label, tamper, message] of cases) {
    const other = await createDatabase([MIGRATION_1]);
    try {
      await other.exec(tamper);
      const hashesBefore = await functionHashes(other);
      const columnsBefore = await currencyColumns(other);
      await failsWith(other, sql, "55000", message);
      assert.deepEqual(await functionHashes(other), hashesBefore, label);
      assert.deepEqual(await currencyColumns(other), columnsBefore, label);
      if (!label.startsWith("the ledger")) assert.equal(await ledger(other), null, label);
    } finally {
      await other.close();
    }
  }
});

test("a stored purchase that breaks the new rules stops the migration (data preflight)", async () => {
  const other = await createDatabase([MIGRATION_1]);
  try {
    const user = await addUser(other);
    const workspace = legacyFixture();
    workspace.analyses[0].purchase.currency = "GBP"; // accepted by the migration-1 validator
    await as(other, user);
    await save(other, user, workspace, 0);
    await failsWith(other, await migrationSql(MIGRATION_2), "23514", /currency rules/);
    assert.deepEqual(await currencyColumns(other), []);
    assert.equal(await ledger(other), null);
  } finally {
    await other.close();
  }
});

test("protocol 3 round-trips TRY, USD and EUR with original amounts and history", async () => {
  const next = v3Of((await v3(0)).workspace);
  next.profile.displayCurrency = "EUR";
  next.entries.push(
    {
      id: randomUUID(),
      type: "income",
      amount: 500,
      currency: "USD",
      cat: "Freelance",
      name: "Client",
      date: "2026-10-26",
    },
    {
      id: randomUUID(),
      type: "expense",
      amount: 999999999999.99,
      currency: "TRY",
      cat: "Other",
      name: "Max",
      date: "2026-10-26",
    },
  );
  const trip = {
    id: randomUUID(),
    name: "Trip",
    target: 1500,
    saved: 250.5,
    currency: "EUR",
    status: "Active",
  };
  next.goals.push(trip);
  const analysisId = randomUUID();
  const purchase = { ...structuredClone(next.analyses[0].purchase), price: 120, currency: "USD" };
  next.analyses.push({
    id: analysisId,
    purchase,
    result: {
      ...structuredClone(next.analyses[0].result),
      goal: { ...trip },
      basis: "TRY",
      rates: { source: "TCMB", bulletin: "2026/166", date: "2026-09-04" },
    },
    goalId: trip.id,
    createdAt: "2026-10-26T10:00:00Z",
  });
  next.decisions.push({
    ...purchase,
    id: randomUUID(),
    analysisId,
    decision: "Buy",
    date: "2026-10-26",
    fit: 84,
  });
  next.waiting.push({
    ...purchase,
    id: randomUUID(),
    analysisId,
    added: "2026-10-26",
    review: "2026-10-29",
    fit: 84,
  });
  await commit(0, next, 3);
  const loaded = await v3(0);
  assert.equal(loaded.protocol, 3);
  const w = loaded.workspace;
  assert.equal(w.profile.displayCurrency, "EUR");
  assert.deepEqual(Object.fromEntries(w.entries.map((e) => [e.name, [e.amount, e.currency]])), {
    Salary: [32000.5, "TRY"],
    Client: [500, "USD"],
    Max: [999999999999.99, "TRY"],
  });
  const goal = w.goals.find((g) => g.name === "Trip");
  assert.deepEqual([goal.target, goal.saved, goal.currency], [1500, 250.5, "EUR"]);
  const analysis = w.analyses.find((a) => a.id === analysisId);
  assert.deepEqual(analysis.purchase, purchase);
  assert.equal(analysis.result.goal.currency, "EUR");
  assert.equal(analysis.result.rates.bulletin, "2026/166");
  assert.deepEqual(w.analyses.find((a) => a.id !== analysisId).result, saved[0].analyses[0].result);
  // Saving the loaded workspace again changes nothing.
  await commit(0, w, 3);
  assert.deepEqual((await v3(0)).workspace, w);
});

test("protocol 2, unknown protocols and missing or invalid currencies are rejected", async () => {
  const good = v3Of((await v3(0)).workspace);
  await asUser(0);
  for (const version of [2, 0, 4, "3", null])
    await unchanged(0, { ...good, schemaVersion: version }, "22023", { version: 3 });
  const corruptions = [
    (p) => (p.entries[0].currency = "GBP"),
    (p) => (p.entries[0].currency = "usd"),
    (p) => (p.entries[0].currency = null),
    (p) => delete p.entries[0].currency,
    (p) => delete p.goals[0].currency,
    (p) => delete p.analyses[0].purchase.currency,
    (p) => delete p.decisions[0].currency,
    (p) => (p.waiting[0].currency = "TL"),
    (p) => delete p.profile.displayCurrency,
    (p) => (p.profile.displayCurrency = "symbol"),
    (p) => (p.profile.currency = "USD"),
    (p) => (p.analyses[0].result.basis = "USD"),
    (p) => (p.analyses[0].result.goal.currency = "GBP"),
    (p) =>
      (p.analyses[0].result.rates = { source: "ECB", bulletin: "2026/166", date: "2026-09-04" }),
  ];
  for (const corrupt of corruptions) {
    const payload = structuredClone(good);
    corrupt(payload);
    await unchanged(0, payload, "22023", { version: 3 });
  }
  // load_workspace_v3 accepts only client protocol 3.
  for (const protocol of [1, 2, 4, null])
    await assert.rejects(loadV3(db, users[0], protocol), { code: "22023" });
  const direct = [
    [
      "update public.spendsense_money_entries set currency='GBP' where id=$1",
      saved[0].entries[0].id,
      "23514",
    ],
    [
      "update public.spendsense_money_entries set currency=null where id=$1",
      saved[0].entries[0].id,
      "23502",
    ],
    [
      "update public.spendsense_user_profiles set display_currency='XYZ' where user_id=$1",
      users[0],
      "23514",
    ],
    [
      `update public.spendsense_purchase_analyses set purchase=purchase||'{"currency":"GBP"}' where id=$1`,
      saved[0].analyses[0].id,
      "23514",
    ],
  ];
  for (const [sql, id, code] of direct) await assert.rejects(db.query(sql, [id]), { code }, sql);
});

test("protocol 1 keeps working for TRY-only accounts and can never write another currency", async () => {
  const next = structuredClone((await legacy(0)).workspace);
  next.entries.push({
    id: randomUUID(),
    type: "expense",
    amount: 50.25,
    cat: "Food",
    name: "Lunch",
    date: "2026-10-26",
  });
  next.entries[0].amount = 33000;
  next.goals[0].saved = 2000;
  await commit(0, next, 1);
  const loaded = (await legacy(0)).workspace;
  assert.deepEqual(loaded.entries.map((e) => [e.name, e.amount]).sort(), [
    ["Lunch", 50.25],
    ["Salary", 33000],
  ]);
  assert.ok(loaded.entries.every((e) => !("currency" in e)));
  assert.deepEqual(
    (await v3(0)).workspace.entries.map((e) => e.currency),
    ["TRY", "TRY"],
  );
  // Explicit deletion still requires intent.
  const removed = structuredClone(loaded);
  removed.entries = removed.entries.filter((e) => e.name !== "Lunch");
  await unchanged(0, removed, "22023");
  await commit(0, removed, 1);
  assert.equal((await legacy(0)).workspace.entries.length, 1);
  // Echoed TRY keys are accepted; any other currency in a protocol 1 payload is not.
  const echoed = v3Of((await legacy(0)).workspace);
  echoed.profile.displayCurrency = "USD"; // never written by protocol 1
  await saveAs(0, echoed);
  assert.equal((await v3(0)).workspace.profile.displayCurrency, "TRY");
  for (const corrupt of [
    (p) => (p.entries[0].currency = "USD"),
    (p) => (p.goals[0].currency = "EUR"),
    (p) => (p.analyses[0].purchase.currency = "USD"),
    (p) => (p.decisions[0].currency = "EUR"),
    (p) => (p.profile.displayCurrency = "GBP"),
  ]) {
    const payload = v3Of((await legacy(0)).workspace);
    corrupt(payload);
    await unchanged(0, payload, "22023");
  }
});

test("protocol 1 can neither load nor save once any monetary surface holds USD/EUR", async () => {
  const surfaces = {
    "money entry": (w) => (w.entries[0].currency = "USD"),
    "savings goal": (w) => (w.goals[0].currency = "EUR"),
    "analysis purchase": (w) => (w.analyses[0].purchase.currency = "USD"),
    "goal snapshot inside analysis history": (w) => (w.analyses[0].result.goal.currency = "EUR"),
    "decision purchase": (w) => (w.decisions[0].currency = "USD"),
    "waiting-list purchase": (w) => (w.waiting[0].currency = "EUR"),
  };
  for (const [label, make] of Object.entries(surfaces)) {
    const start = v3Of((await v3(0)).workspace);
    make(start);
    await commit(0, start, 3);
    // Reads: no data at all for a TRY-only client.
    await asUser(0);
    await assert.rejects(loadLegacy(db, users[0]), { code: "0A000" }, label);
    // Writes: echo, edit and deletion attempts are all refused before any change.
    const current = (await v3(0)).workspace;
    await unchanged(0, current, "0A000");
    const edited = structuredClone(current);
    edited.entries[0].amount = 1;
    delete edited.entries[0].currency;
    await unchanged(0, edited, "0A000");
    const { payload } = prepareWorkspaceSave(current, { ...current, entries: [] }, users[0]);
    await unchanged(0, payload, "0A000");
    // Other accounts are unaffected; protocol 3 still works for this one.
    assert.ok(await legacy(1));
    await commit(1, (await legacy(1)).workspace, 1);
    // Back to lira only: protocol 1 works again.
    await commit(0, v3Of(saved[0]), 3);
    assert.ok(await legacy(0), label);
  }
});

test("a display currency alone does not block TRY-only clients, and they never see it", async () => {
  const next = v3Of((await v3(0)).workspace);
  next.profile.displayCurrency = "USD";
  await commit(0, next, 3);
  const loaded = await legacy(0);
  assert.equal(loaded.workspace.profile.displayCurrency, undefined);
  assert.ok(loaded.workspace.entries.every((e) => !("currency" in e)));
  await commit(0, loaded.workspace, 1);
  assert.equal((await v3(0)).workspace.profile.displayCurrency, "USD"); // protocol 1 did not change it
});

test("a protocol 1 save prepared before USD/EUR data appeared is refused afterwards", async () => {
  // The TRY-only client loaded its workspace and revision while the account was lira-only.
  const stale = (await legacy(0)).workspace;
  // Another (protocol 3) session adds a USD record; the TRY-only client then saves with the
  // latest revision token: the server re-checks under the profile lock and refuses.
  const usd = v3Of((await v3(0)).workspace);
  usd.entries[0].currency = "USD";
  await commit(0, usd, 3);
  await unchanged(0, stale, "0A000");
  // With its own (older) revision it is refused as well, never applied.
  await unchanged(0, stale, "0A000", { revision: revisions[0] - 1 });
});

test("RLS and ownership: no cross-user reads or writes through either protocol", async () => {
  await commit(1, v3Of((await v3(1)).workspace, "USD"), 3);
  const otherBefore = await v3(1);
  await asUser(0);
  assert.equal(await loadV3(db, users[1]), null);
  assert.equal(await loadLegacy(db, users[1]), null); // own account is lira: no 0A000, no data
  for (const table of ["money_entries", "savings_goals", "user_profiles"]) {
    const rows = (await db.query(`select user_id from public.spendsense_${table}`)).rows;
    assert.deepEqual(
      rows.map((r) => r.user_id),
      [users[0]],
      table,
    );
  }
  assert.equal(
    (
      await db.query(
        "update public.spendsense_money_entries set currency='TRY' where user_id=$1 returning id",
        [users[1]],
      )
    ).rows.length,
    0,
  );
  for (const key of COLLECTIONS) {
    const attempted = v3Of((await v3(0)).workspace);
    attempted[key].push(structuredClone(otherBefore.workspace[key][0]));
    await unchanged(0, attempted, "42501", { version: 3 });
  }
  await unchanged(0, { ...v3Of((await v3(0)).workspace), ownerId: users[1] }, "42501", {
    version: 3,
  });
  assert.deepEqual(await v3(1), otherBefore);
});

test("optimistic locking and explicit deletion rules are unchanged for protocol 3", async () => {
  const current = v3Of((await v3(0)).workspace);
  await unchanged(0, current, "40001", { version: 3, revision: 0 });
  await unchanged(0, current, "22023", { version: 3, revision: null });
  const stale = revisions[0];
  await asUser(0);
  await db.query("update public.spendsense_money_entries set amount=33000 where id=$1", [
    saved[0].entries[0].id,
  ]);
  assert.ok((await v3(0)).revision > stale);
  await unchanged(0, current, "40001", { version: 3, revision: stale });
  revisions[0] = (await v3(0)).revision;
  for (const key of COLLECTIONS) {
    for (const replacement of [undefined, null, []]) {
      const payload = v3Of((await v3(0)).workspace);
      payload[key] = replacement;
      await unchanged(0, payload, "22023", { version: 3 });
    }
  }
  await unchanged(
    0,
    {
      ...v3Of((await v3(0)).workspace),
      deletions: { ...deletionList(), entries: [saved[1].entries[0].id] },
    },
    "42501",
    { version: 3 },
  );
  const next = v3Of((await v3(0)).workspace);
  next.entries = [];
  await commit(0, next, 3);
  assert.equal((await v3(0)).workspace.entries.length, 0);
  assert.equal((await v3(1)).workspace.entries.length, 1);
});

test("historical analyses keep their snapshot through upgrades and goal deletion", async () => {
  const original = (await v3(0)).workspace.analyses[0];
  const next = v3Of((await v3(0)).workspace);
  next.goals = [];
  await commit(0, next, 3);
  const analysis = (await v3(0)).workspace.analyses[0];
  assert.equal(analysis.goalId, undefined);
  assert.deepEqual(analysis.result, original.result);
  assert.deepEqual(analysis.purchase, { ...original.purchase, currency: "TRY" });
  assert.equal(analysis.createdAt, original.createdAt);
});

test("a fresh database with both migrations accepts new protocol 1 and protocol 3 accounts", async () => {
  const fresh = await createDatabase([MIGRATION_1, MIGRATION_2]);
  try {
    const legacyUser = await addUser(fresh);
    await as(fresh, legacyUser);
    assert.equal(await loadLegacy(fresh, legacyUser), null);
    await save(fresh, legacyUser, legacyFixture(), 0, 1);
    assert.equal((await loadV3(fresh, legacyUser)).workspace.profile.displayCurrency, "TRY");
    const modern = await addUser(fresh);
    await as(fresh, modern);
    assert.equal(await loadV3(fresh, modern), null);
    const workspace = v3Of(legacyFixture(), "EUR");
    workspace.profile.displayCurrency = "USD";
    await save(fresh, modern, workspace, 0, 3);
    const loaded = (await loadV3(fresh, modern)).workspace;
    assert.equal(loaded.profile.displayCurrency, "USD");
    assert.equal(loaded.entries[0].currency, "EUR");
    await assert.rejects(loadLegacy(fresh, modern), { code: "0A000" });
    const hashes = await functionHashes(fresh);
    for (const name of NEW_FUNCTIONS) assert.ok(hashes[name], name);
  } finally {
    await fresh.close();
  }
});
