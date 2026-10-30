// Shared fixtures for the local PGlite database tests (not a test file itself).
// Nothing here connects to a remote database.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

export const MIGRATION_1 = "202610250001_spendsense.sql";
export const MIGRATION_2 = "202610280001_spendsense_currency.sql";
const root = new URL("../../../supabase/", import.meta.url);
export const migrationSql = (name) => readFile(new URL(`migrations/${name}`, root), "utf8");
export const rollbackSql = () =>
  readFile(new URL("rollback/202610280001_spendsense_currency_rollback.sql", root), "utf8");

export const TABLES = [
  "user_profiles",
  "money_entries",
  "savings_goals",
  "spending_profiles",
  "purchase_analyses",
  "purchase_decisions",
  "purchase_reflections",
  "waiting_items",
];
export const COLLECTIONS = ["entries", "goals", "analyses", "decisions", "waiting"];
export const NEW_FUNCTIONS = [
  "spendsense_has_foreign_currency",
  "spendsense_json_currency",
  "spendsense_load_workspace_v3",
  "spendsense_valid_currency_field",
];
export const scores = {
  "Impulsive Decision Maker": 70,
  "Planned Spender": 30,
  "Bargain Hunter": 50,
  "Reward-Driven Spender": 15,
  "Social Spender": 70,
};
export const deletionList = () =>
  Object.fromEntries([...COLLECTIONS, "reflections"].map((k) => [k, []]));

/** Supabase-like prerequisites: API roles, auth schema stubs and an unrelated team table. */
export const AUTH_STUBS = `create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email','test@example.com') $$;
  grant usage on schema auth,public to anon,authenticated,service_role;
  grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
  create table public.existing_team_table(value text); insert into public.existing_team_table values ('preserved');`;

/** Runs a migration or rollback file as the (superuser) session user. */
export async function runSql(db, sql) {
  await db.exec("reset role");
  await db.exec(sql);
}

/** A fresh database with the given migrations applied by the (superuser) session user. */
export async function createDatabase(migrations = [MIGRATION_1, MIGRATION_2]) {
  const db = new PGlite();
  await db.exec(AUTH_STUBS);
  for (const name of migrations) await db.exec(await migrationSql(name));
  return db;
}

export async function addUser(db) {
  const id = randomUUID();
  await db.exec("reset role");
  await db.query("insert into auth.users values ($1)", [id]);
  return id;
}
export async function as(db, userId) {
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
}

/** A workspace exactly as the current (protocol 1) frontend saves it: no currency anywhere. */
export function legacyFixture() {
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
    goal: { ...goal },
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

/** The workspace in protocol 3 form: explicit currencies everywhere (missing → `currency`). */
export function v3Of(workspace, currency = "TRY") {
  const next = structuredClone(workspace);
  next.profile.displayCurrency ??= "TRY";
  for (const entry of next.entries) entry.currency ??= currency;
  for (const goal of next.goals) goal.currency ??= currency;
  for (const analysis of next.analyses) analysis.purchase.currency ??= currency;
  for (const item of [...next.decisions, ...next.waiting]) item.currency ??= currency;
  return next;
}

/** Raw save through the RPC (owner, version and empty deletions filled in unless given). */
export async function save(db, userId, payload, revision, version = 1) {
  const response = await db.query(
    "select public.spendsense_save_workspace($1::jsonb,$2::bigint) as revision",
    [
      JSON.stringify({
        ownerId: userId,
        schemaVersion: version,
        deletions: deletionList(),
        behaviorScores: scores,
        ...payload,
      }),
      revision,
    ],
  );
  return response.rows[0].revision;
}
export async function loadLegacy(db, userId) {
  return (await db.query("select public.spendsense_load_workspace($1::uuid) as r", [userId]))
    .rows[0].r;
}
export async function loadV3(db, userId, protocol = 3) {
  return (
    await db.query("select public.spendsense_load_workspace_v3($1::uuid, $2::integer) as r", [
      userId,
      protocol,
    ])
  ).rows[0].r;
}

/** md5 of every spendsense_* function body, as the migrations compute it. */
export async function functionHashes(db) {
  await db.exec("reset role");
  const rows = (
    await db.query(`select proname, md5(replace(prosrc, E'\\r', '')) as hash from pg_proc
      where pronamespace = 'public'::regnamespace and proname like 'spendsense_%' order by 1`)
  ).rows;
  return Object.fromEntries(rows.map((row) => [row.proname, row.hash]));
}
export async function currencyColumns(db) {
  await db.exec("reset role");
  return (
    await db.query(`select table_name || '.' || column_name as c from information_schema.columns
      where table_schema = 'public' and column_name in ('currency','display_currency')
        and not (table_name = 'spendsense_user_profiles' and column_name = 'currency') order by 1`)
  ).rows.map((row) => row.c);
}
export async function ledger(db) {
  await db.exec("reset role");
  if (!(await db.query("select to_regclass('spendsense_meta.schema_migrations') as t")).rows[0].t)
    return null;
  return (
    await db.query(
      "select version, name, status, recorded_by from spendsense_meta.schema_migrations order by version",
    )
  ).rows;
}
/** Every row of every SpendSense table, deterministic order, for before/after comparison. */
export async function allRows(db, strip = {}) {
  await db.exec("reset role");
  const rows = {};
  for (const table of TABLES) {
    rows[table] = (
      await db.query(
        `select to_jsonb(t) as row from public.spendsense_${table} t
          order by (to_jsonb(t) - 'currency' - 'display_currency')::text`,
      )
    ).rows.map(({ row }) => {
      const copy = { ...row };
      for (const key of strip[table] ?? []) delete copy[key];
      return copy;
    });
  }
  return rows;
}
/** Runs SQL that is expected to fail, then rolls back the aborted transaction. */
export async function failsWith(db, sql, code, message) {
  let error;
  await db.exec("reset role"); // the SQL decides its own role (default: session superuser)
  try {
    await db.exec(sql);
  } catch (failure) {
    error = failure;
  }
  await db.exec("rollback").catch(() => {});
  await db.exec("reset role");
  if (!error) throw new Error("Expected the SQL to fail");
  if (error.code !== code) throw new Error(`Expected ${code}, got ${error.code}: ${error.message}`);
  if (message && !message.test(error.message))
    throw new Error(`Unexpected message: ${error.message}`);
  return error;
}
