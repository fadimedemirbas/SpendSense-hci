import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { prepareWorkspaceSave, assertLoadedWorkspace } from "../src/lib/workspaceProtocol.ts";

// Local PGlite only: migration 202610250001 (as deployed) + the proposed currency
// migration 202610280001 on top of data saved by the current (schemaVersion 1)
// frontend. No network or remote Supabase access.
const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);
const base = () => readFile(new URL("202610250001_spendsense.sql", MIGRATIONS), "utf8");
const currencyMigration = () =>
  readFile(new URL("202610280001_spendsense_currency.sql", MIGRATIONS), "utf8");

const AUTH_STUBS = `create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email','test@example.com') $$;
  grant usage on schema auth,public to anon,authenticated;
  grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
  create table public.existing_team_table(value text); insert into public.existing_team_table values ('preserved');`;
const tables = [
  "user_profiles",
  "money_entries",
  "savings_goals",
  "spending_profiles",
  "purchase_analyses",
  "purchase_decisions",
  "purchase_reflections",
  "waiting_items",
];
const collections = ["entries", "goals", "analyses", "decisions", "waiting"];
const scores = {
  "Impulsive Decision Maker": 70,
  "Planned Spender": 30,
  "Bargain Hunter": 50,
  "Reward-Driven Spender": 15,
  "Social Spender": 70,
};
const deletionList = () => Object.fromEntries([...collections, "reflections"].map((k) => [k, []]));

/** A workspace exactly as the current frontend saves it: no currency anywhere. */
function legacyFixture() {
  const purchase = {
    name: "Headphones",
    price: 2500,
    cat: "Shopping",
    reasons: ["need"],
    feeling: "Calm",
    own: false,
    wait: "3d",
  };
  const goal = { id: randomUUID(), name: "Laptop", target: 35000, saved: 1000, status: "Active" };
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
    goal,
  };
  return {
    profile: {
      email: "unused@example.com",
      income: 1,
      savings: 2,
      habits: [0, 1, 2, 0],
      onboarded: true,
      currency: "symbol",
    },
    behaviorScores: scores,
    entries: [
      {
        id: randomUUID(),
        type: "income",
        amount: 32000.5,
        cat: "Salary",
        name: "Salary",
        date: "2026-10-25",
      },
    ],
    goals: [goal],
    analyses: [
      { id: analysisId, purchase, result, goalId: goal.id, createdAt: "2026-10-25T12:00:00Z" },
    ],
    decisions: [
      {
        ...purchase,
        id: randomUUID(),
        analysisId,
        decision: "Wait",
        date: "2026-10-25",
        fit: 84,
        reflection: 4,
      },
    ],
    waiting: [
      {
        ...purchase,
        id: randomUUID(),
        analysisId,
        added: "2026-10-25",
        review: "2026-10-28",
        fit: 84,
      },
    ],
  };
}
/** The same workspace in schemaVersion 2 form: every amount carries a currency. */
function v2Of(workspace, currency = "TRY") {
  const next = structuredClone(workspace);
  next.profile.displayCurrency ??= "TRY";
  for (const entry of next.entries) entry.currency ??= currency;
  for (const goal of next.goals) goal.currency ??= currency;
  for (const analysis of next.analyses) analysis.purchase.currency ??= currency;
  for (const item of [...next.decisions, ...next.waiting]) item.currency ??= currency;
  return next;
}

async function createDatabase({ withCurrency = true } = {}) {
  const db = new PGlite();
  await db.exec(AUTH_STUBS);
  await db.exec(await base());
  if (withCurrency) await db.exec(await currencyMigration());
  return db;
}

let db;
const users = [randomUUID(), randomUUID(), randomUUID()];
let saved, versions, currentIndex;
let migrationReport;

async function asUser(index) {
  currentIndex = index;
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[index]]);
}
async function save(payload, { version = 1, revision = versions[currentIndex] } = {}) {
  const response = await db.query(
    "select public.spendsense_save_workspace($1::jsonb,$2::bigint) as revision",
    [
      JSON.stringify({
        ownerId: users[currentIndex],
        schemaVersion: version,
        deletions: deletionList(),
        ...payload,
      }),
      revision,
    ],
  );
  return (versions[currentIndex] = response.rows[0].revision);
}
async function load() {
  return (
    await db.query("select public.spendsense_load_workspace($1::uuid) as result", [
      users[currentIndex],
    ])
  ).rows[0].result;
}
/** Saves `next` with the real frontend deletion protocol, as version 1 or 2. */
async function commit(next, version = 1) {
  const previous = (await load()).workspace;
  const { payload } = prepareWorkspaceSave(previous, next, users[currentIndex]);
  return save({ ...payload, schemaVersion: version, behaviorScores: scores }, { version });
}
async function unchangedAfter(payload, code, options = {}) {
  const { version = 1 } = options;
  const revision = "revision" in options ? options.revision : versions[currentIndex];
  const previous = await load();
  await assert.rejects(save(payload, { version, revision }), { code });
  assert.deepEqual(await load(), previous);
}
async function rawRows() {
  await db.exec("reset role");
  const rows = {};
  for (const table of tables)
    rows[table] = (
      await db.query(
        `select to_jsonb(t) as row from public.spendsense_${table} t
          order by (to_jsonb(t) - 'currency' - 'display_currency')::text`,
      )
    ).rows.map((r) => r.row);
  return rows;
}
// The only keys the migration may add to existing rows.
const ADDED = {
  money_entries: "currency",
  savings_goals: "currency",
  user_profiles: "display_currency",
};
function withoutAdded(table, row) {
  const copy = { ...row };
  if (ADDED[table]) delete copy[ADDED[table]];
  return copy;
}

before(async () => {
  // 1. The database as deployed today, with data saved by the current frontend.
  db = await createDatabase({ withCurrency: false });
  for (const user of users) await db.query("insert into auth.users values ($1)", [user]);
  saved = [legacyFixture(), legacyFixture()];
  versions = [0, 0, 0];
  for (let i = 0; i < 2; i++) {
    await asUser(i);
    await save(saved[i], { revision: 0 });
  }
  const before = { rows: await rawRows(), loads: [] };
  for (let i = 0; i < 2; i++) {
    await asUser(i);
    before.loads.push(await load());
  }
  // 2. Apply the proposed migration on top (as the migration owner).
  await db.exec("reset role");
  await db.exec(await currencyMigration());
  const afterRows = await rawRows();
  const afterLoads = [];
  for (let i = 0; i < 2; i++) {
    await asUser(i);
    afterLoads.push(await load());
  }
  migrationReport = { before, after: { rows: afterRows, loads: afterLoads } };
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
  versions = [0, 0, 0];
  for (let i = 0; i < 2; i++) {
    await asUser(i);
    assert.ok((await save(saved[i], { revision: 0 })) > 0);
  }
});
after(async () => await db.close());

test("migration on an existing database keeps every row, amount, revision and snapshot", () => {
  const { before, after } = migrationReport;
  for (const table of tables) {
    assert.equal(after.rows[table].length, before.rows[table].length, table);
    assert.deepEqual(
      after.rows[table].map((row) => withoutAdded(table, row)),
      before.rows[table],
      table,
    );
  }
  // Amounts are exactly as stored (numeric text, no conversion or rounding).
  assert.deepEqual(
    after.rows.money_entries.map((row) => [row.amount, row.currency]),
    [
      [32000.5, "TRY"],
      [32000.5, "TRY"],
    ],
  );
  for (const row of after.rows.savings_goals) assert.equal(row.currency, "TRY");
  for (const row of after.rows.user_profiles) {
    assert.equal(row.display_currency, "TRY");
    assert.equal(row.currency, "symbol"); // the existing format preference is untouched
  }
  for (let i = 0; i < 2; i++) {
    const [old, next] = [before.loads[i], after.loads[i]];
    assert.equal(next.revision, old.revision); // adding columns writes nothing
    assertLoadedWorkspace(next);
    assert.equal(next.workspace.profile.displayCurrency, "TRY");
    assert.deepEqual(
      next.workspace.entries,
      old.workspace.entries.map((e) => ({ ...e, currency: "TRY" })),
    );
    assert.deepEqual(
      next.workspace.goals,
      old.workspace.goals.map((g) => ({ ...g, currency: "TRY" })),
    );
    // Purchases and analysis history come back byte-for-byte as before.
    for (const key of ["analyses", "decisions", "waiting"])
      assert.deepEqual(next.workspace[key], old.workspace[key], key);
  }
});

test("the migration adds checked columns, keeps RLS, grants and constraints, and preserves other tables", async () => {
  await db.exec("reset role");
  const columns = (
    await db.query(`select table_name, column_name, is_nullable, column_default from information_schema.columns
      where table_schema='public' and column_name in ('currency','display_currency') order by 1,2`)
  ).rows;
  assert.deepEqual(
    columns.map((c) => [c.table_name, c.column_name, c.is_nullable, c.column_default]),
    [
      ["spendsense_money_entries", "currency", "NO", "'TRY'::text"],
      ["spendsense_savings_goals", "currency", "NO", "'TRY'::text"],
      ["spendsense_user_profiles", "currency", "NO", "'symbol'::text"],
      ["spendsense_user_profiles", "display_currency", "NO", "'TRY'::text"],
    ],
  );
  for (const table of tables) {
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
  for (const name of [
    "json_currency",
    "valid_currency_field",
    "valid_goal",
    "valid_purchase",
    "valid_analysis",
  ])
    assert.equal(volatility["spendsense_" + name], "i", name);
  for (const name of ["valid_workspace", "load_workspace"])
    assert.equal(volatility["spendsense_" + name], "s");
  assert.equal(volatility.spendsense_save_workspace, "v");
  assert.equal(volatility.spendsense_has_foreign_currency, "s");
  // Pre-existing amount and integrity constraints still exist alongside the new ones.
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
  // Anonymous callers still cannot use the RPCs or tables.
  await db.exec("set role anon");
  await assert.rejects(db.query("select public.spendsense_load_workspace($1::uuid)", [users[0]]), {
    code: "42501",
  });
  await assert.rejects(db.query("select currency from public.spendsense_money_entries"), {
    code: "42501",
  });
  await db.exec("reset role");
});

test("the migration fails as a whole instead of changing anything when it cannot apply cleanly", async () => {
  // Applying it twice: the columns already exist, so nothing is altered.
  await db.exec("reset role");
  await assert.rejects(db.exec(await currencyMigration()), { code: "42701" });
  await db.exec("rollback");

  // A legacy row with an unknown currency key (accepted by the old validator)
  // aborts the migration instead of becoming an unsaveable record.
  const other = await createDatabase({ withCurrency: false });
  try {
    const user = randomUUID();
    await other.query("insert into auth.users values ($1)", [user]);
    const workspace = legacyFixture();
    workspace.analyses[0].purchase.currency = "GBP";
    await other.exec("set role authenticated");
    await other.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await other.query("select public.spendsense_save_workspace($1::jsonb, 0)", [
      JSON.stringify({ ownerId: user, schemaVersion: 1, deletions: deletionList(), ...workspace }),
    ]);
    await other.exec("reset role");
    await assert.rejects(other.exec(await currencyMigration()), { code: "23514" });
    await other.exec("rollback");
    const columns = await other.query(
      "select 1 from information_schema.columns where table_name='spendsense_money_entries' and column_name='currency'",
    );
    assert.equal(columns.rows.length, 0); // nothing from the failed migration remains
  } finally {
    await other.close();
  }
});

test("a fresh database with both migrations accepts new TRY/USD/EUR workspaces", async () => {
  const fresh = await createDatabase();
  try {
    const user = randomUUID();
    await fresh.query("insert into auth.users values ($1)", [user]);
    await fresh.exec("set role authenticated");
    await fresh.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    const workspace = v2Of(legacyFixture(), "EUR");
    workspace.profile.displayCurrency = "USD";
    await fresh.query("select public.spendsense_save_workspace($1::jsonb, 0)", [
      JSON.stringify({ ownerId: user, schemaVersion: 2, deletions: deletionList(), ...workspace }),
    ]);
    const loaded = (await fresh.query("select public.spendsense_load_workspace($1) as r", [user]))
      .rows[0].r.workspace;
    assert.equal(loaded.profile.displayCurrency, "USD");
    assert.equal(loaded.entries[0].currency, "EUR");
  } finally {
    await fresh.close();
  }
});

test("schemaVersion 2 round-trips TRY, USD and EUR records with original amounts", async () => {
  await asUser(0);
  const next = v2Of((await load()).workspace);
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
      amount: 15.99,
      currency: "EUR",
      cat: "Subscriptions",
      name: "Music",
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
  next.goals.push({
    id: randomUUID(),
    name: "Trip",
    target: 1500,
    saved: 250.5,
    currency: "EUR",
    status: "Active",
  });
  const analysisId = randomUUID();
  const purchase = { ...structuredClone(next.analyses[0].purchase), price: 120, currency: "USD" };
  next.analyses.push({
    id: analysisId,
    purchase,
    result: {
      ...structuredClone(next.analyses[0].result),
      basis: "TRY",
      rates: {
        source: "TCMB",
        bulletin: "2026/166",
        date: "2026-09-04",
        USD: "48.27605",
        EUR: "56.1076",
      },
    },
    goalId: next.goals[0].id,
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
  await commit(next, 2);
  const loaded = (await load()).workspace;
  assert.equal(loaded.profile.displayCurrency, "EUR");
  assert.equal(loaded.profile.currency, "symbol");
  const byName = Object.fromEntries(loaded.entries.map((e) => [e.name, [e.amount, e.currency]]));
  assert.deepEqual(byName, {
    Salary: [32000.5, "TRY"],
    Client: [500, "USD"],
    Music: [15.99, "EUR"],
    Max: [999999999999.99, "TRY"],
  });
  const trip = loaded.goals.find((g) => g.name === "Trip");
  assert.deepEqual([trip.target, trip.saved, trip.currency], [1500, 250.5, "EUR"]);
  const analysis = loaded.analyses.find((a) => a.id === analysisId);
  assert.deepEqual(analysis.purchase, purchase);
  assert.equal(analysis.result.rates.bulletin, "2026/166");
  assert.equal(loaded.decisions.find((d) => d.decision === "Buy").currency, "USD");
  assert.equal(loaded.waiting.find((w) => w.analysisId === analysisId).currency, "USD");
  // A second identical save changes nothing.
  await commit(loaded, 2);
  assert.deepEqual((await load()).workspace, loaded);
});

test("invalid or missing currencies are rejected through the RPC and direct writes", async () => {
  await asUser(0);
  const good = v2Of((await load()).workspace);
  const corruptions = [
    (p) => (p.entries[0].currency = "GBP"),
    (p) => (p.entries[0].currency = "usd"),
    (p) => (p.entries[0].currency = ""),
    (p) => (p.entries[0].currency = null),
    (p) => (p.entries[0].currency = 1),
    (p) => delete p.entries[0].currency,
    (p) => (p.goals[0].currency = "XAU"),
    (p) => delete p.goals[0].currency,
    (p) => (p.analyses[0].purchase.currency = "JPY"),
    (p) => delete p.analyses[0].purchase.currency,
    (p) => delete p.decisions[0].currency,
    (p) => (p.waiting[0].currency = "TL"),
    (p) => delete p.profile.displayCurrency,
    (p) => (p.profile.displayCurrency = "symbol"),
    (p) => (p.profile.currency = "USD"), // the format preference keeps its own meaning
    (p) => (p.analyses[0].result.basis = "USD"),
    (p) =>
      (p.analyses[0].result.rates = { source: "ECB", bulletin: "2026/166", date: "2026-09-04" }),
    (p) => (p.analyses[0].result.rates = { source: "TCMB", bulletin: "166", date: "2026-09-04" }),
    (p) => (p.analyses[0].result.goal.currency = "GBP"),
  ];
  for (const corrupt of corruptions) {
    const payload = structuredClone(good);
    corrupt(payload);
    await unchangedAfter({ ...payload, behaviorScores: scores }, "22023", { version: 2 });
  }
  for (const version of [0, 3, "2", null]) {
    await unchangedAfter({ ...good, behaviorScores: scores, schemaVersion: version }, "22023");
  }
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
      "update public.spendsense_savings_goals set currency='usd' where id=$1",
      saved[0].goals[0].id,
      "23514",
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
    [
      `update public.spendsense_waiting_items set purchase=purchase||'{"currency":7}' where id=$1`,
      saved[0].waiting[0].id,
      "23514",
    ],
  ];
  for (const [sql, id, code] of direct) await assert.rejects(db.query(sql, [id]), { code }, sql);
});

test("schemaVersion 1 keeps working unchanged for accounts that hold only lira", async () => {
  await asUser(0);
  const next = structuredClone((await load()).workspace); // includes echoed currency keys
  const expense = {
    id: randomUUID(),
    type: "expense",
    amount: 50.25,
    cat: "Food",
    name: "Lunch",
    date: "2026-10-26",
  };
  next.entries.push(expense); // a new record from an old client has no currency
  next.entries[0].amount = 33000;
  next.goals[0].saved = 2000;
  next.decisions[0].decision = "Buy";
  await commit(next, 1);
  const loaded = (await load()).workspace;
  assert.deepEqual(loaded.entries.map((e) => [e.name, e.amount, e.currency]).sort(), [
    ["Lunch", 50.25, "TRY"],
    ["Salary", 33000, "TRY"],
  ]);
  assert.equal(loaded.goals[0].saved, 2000);
  assert.equal(loaded.goals[0].currency, "TRY");
  assert.equal(loaded.profile.displayCurrency, "TRY");
  // Explicit deletion through version 1 still works and still requires intent.
  const removed = structuredClone(loaded);
  removed.entries = removed.entries.filter((e) => e.name !== "Lunch");
  await unchangedAfter({ ...removed, behaviorScores: scores }, "22023");
  await commit(removed, 1);
  assert.equal((await load()).workspace.entries.length, 1);
  // A version 1 payload cannot introduce another currency or change the display currency.
  for (const corrupt of [
    (p) => (p.entries[0].currency = "USD"),
    (p) => (p.goals[0].currency = "EUR"),
    (p) => (p.analyses[0].purchase.currency = "USD"),
    (p) => (p.decisions[0].currency = "EUR"),
    (p) => (p.profile.displayCurrency = "GBP"),
  ]) {
    const payload = structuredClone((await load()).workspace);
    corrupt(payload);
    await unchangedAfter({ ...payload, behaviorScores: scores }, "22023");
  }
  const echoed = structuredClone((await load()).workspace);
  echoed.profile.displayCurrency = "USD"; // valid code, but version 1 never writes it
  await save({ ...echoed, behaviorScores: scores });
  assert.equal((await load()).workspace.profile.displayCurrency, "TRY");
});

test("legacy data upgrades through schemaVersion 2 without touching analysis results", async () => {
  await asUser(0);
  const before = (await load()).workspace;
  await commit(v2Of(before), 2);
  const after = (await load()).workspace;
  assert.deepEqual(after.analyses[0].result, before.analyses[0].result);
  assert.deepEqual(after.analyses[0].purchase, { ...before.analyses[0].purchase, currency: "TRY" });
  assert.equal(after.entries[0].amount, before.entries[0].amount);
  // The account is still all lira, so an older client may keep saving.
  await commit(after, 1);
  assert.equal((await load()).workspace.entries[0].currency, "TRY");
});

test("old clients cannot overwrite an account once it holds USD/EUR data", async () => {
  const cases = [
    (w) => (w.entries[0].currency = "USD"),
    (w) => (w.goals[0].currency = "EUR"),
    (w) => (w.analyses[0].purchase.currency = "USD"),
    (w) => (w.waiting[0].currency = "EUR"),
    (w) => (w.profile.displayCurrency = "USD"),
  ];
  for (const make of cases) {
    await asUser(0);
    const start = v2Of((await load()).workspace);
    make(start);
    await commit(start, 2);
    const current = (await load()).workspace;
    // Echo, edit and deletion attempts from a version 1 client are all refused.
    const echo = structuredClone(current);
    await unchangedAfter({ ...echo, behaviorScores: scores }, "0A000");
    const edited = structuredClone(current);
    edited.entries[0].amount = 1;
    delete edited.entries[0].currency;
    await unchangedAfter({ ...edited, behaviorScores: scores }, "0A000");
    const { payload } = prepareWorkspaceSave(current, { ...current, entries: [] }, users[0]);
    await unchangedAfter({ ...payload, behaviorScores: scores }, "0A000");
    // Version 2 still saves, and other (lira-only) accounts are unaffected.
    await commit(v2Of(current), 2);
    await asUser(1);
    await commit((await load()).workspace, 1);
    // Reset user 0 to the lira fixture for the next case.
    await asUser(0);
    const reset = v2Of(saved[0]);
    await commit(reset, 2);
  }
});

test("RLS isolates the new currency data between users", async () => {
  await asUser(1);
  await commit(
    {
      ...v2Of((await load()).workspace, "USD"),
      profile: { ...v2Of(saved[1]).profile, displayCurrency: "EUR" },
    },
    2,
  );
  const otherBefore = await load();
  await asUser(0);
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
  assert.equal(
    (
      await db.query(
        "update public.spendsense_user_profiles set display_currency='TRY' where user_id=$1 returning user_id",
        [users[1]],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select public.spendsense_load_workspace($1::uuid) as r", [users[1]])).rows[0]
      .r,
    null,
  );
  // Upserting another user's record IDs through version 2 is still refused.
  for (const key of collections) {
    const attempted = v2Of(saved[0]);
    const foreign = structuredClone(otherBefore.workspace[key][0]);
    attempted[key].push(foreign);
    await unchangedAfter({ ...attempted, behaviorScores: scores }, "42501", { version: 2 });
  }
  await unchangedAfter({ ...v2Of(saved[0]), ownerId: users[1], behaviorScores: scores }, "42501", {
    version: 2,
  });
  await asUser(1);
  assert.deepEqual(await load(), otherBefore);
});

test("optimistic locking and explicit deletion rules are unchanged for schemaVersion 2", async () => {
  await asUser(0);
  const current = v2Of((await load()).workspace);
  await unchangedAfter({ ...current, behaviorScores: scores }, "40001", {
    version: 2,
    revision: 0,
  });
  await unchangedAfter({ ...current, behaviorScores: scores }, "22023", {
    version: 2,
    revision: null,
  });
  // A direct currency edit advances the revision, so a cached snapshot cannot undo it.
  const stale = versions[0];
  await db.query("update public.spendsense_money_entries set currency='USD' where id=$1", [
    saved[0].entries[0].id,
  ]);
  assert.ok((await load()).revision > stale);
  await unchangedAfter({ ...current, behaviorScores: scores }, "40001", {
    version: 2,
    revision: stale,
  });
  assert.equal((await load()).workspace.entries[0].currency, "USD");
  versions[0] = (await load()).revision;
  // Missing, empty or partial collections never delete; explicit foreign deletions are refused.
  for (const key of collections) {
    for (const replacement of [undefined, null, []]) {
      const payload = structuredClone(v2Of((await load()).workspace));
      payload[key] = replacement;
      await unchangedAfter({ ...payload, behaviorScores: scores }, "22023", { version: 2 });
    }
  }
  const foreign = {
    ...v2Of((await load()).workspace),
    behaviorScores: scores,
    deletions: { ...deletionList(), entries: [saved[1].entries[0].id] },
  };
  await unchangedAfter(foreign, "42501", { version: 2 });
  // Explicit deletion by the owner works.
  const next = v2Of((await load()).workspace);
  next.entries = [];
  await commit(next, 2);
  assert.equal((await load()).workspace.entries.length, 0);
  await asUser(1);
  assert.equal((await load()).workspace.entries.length, 1);
});

test("existing analysis history survives goal deletion and version 2 saves unchanged", async () => {
  await asUser(0);
  const original = (await load()).workspace.analyses[0];
  const next = v2Of((await load()).workspace);
  next.goals = [];
  await commit(next, 2);
  const after = (await load()).workspace;
  assert.equal(after.analyses[0].goalId, undefined);
  assert.deepEqual(after.analyses[0].result, original.result); // goal snapshot kept, no recalculation
  assert.equal(after.analyses[0].result.goal.id, saved[0].goals[0].id);
  assert.equal(after.analyses[0].result.goal.currency, undefined);
  assert.equal(after.analyses[0].createdAt, original.createdAt);
});
