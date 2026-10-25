import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { analyze, profileTubes } from "../src/store.ts";
import { prepareWorkspaceSave, assertLoadedWorkspace } from "../src/lib/workspaceProtocol.ts";

// Actual migration in isolated PostgreSQL. No network or remote Supabase access.
const db = new PGlite();
const users = [randomUUID(), randomUUID(), randomUUID()];
const collections = ["entries", "goals", "analyses", "decisions", "waiting"];
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
const scores = {
  "Impulsive Decision Maker": 70,
  "Planned Spender": 30,
  "Bargain Hunter": 50,
  "Reward-Driven Spender": 15,
  "Social Spender": 70,
};
let saved, versions, currentIndex;
const deletionList = () => Object.fromEntries([...collections, "reflections"].map((k) => [k, []]));
function fixture() {
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
        amount: 32000,
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
async function asUser(index) {
  currentIndex = index;
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[index]]);
}
async function save(payload, revision = versions[currentIndex]) {
  const response = await db.query(
    "select public.spendsense_save_workspace($1::jsonb,$2::bigint) as revision",
    [
      JSON.stringify({
        ownerId: users[currentIndex],
        schemaVersion: 1,
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
async function commit(next) {
  const previous = (await load()).workspace;
  const { payload } = prepareWorkspaceSave(previous, next, users[currentIndex]);
  return save({ ...payload, behaviorScores: next.behaviorScores ?? scores });
}
async function unchangedAfter(payload, code = "22023", revision = versions[currentIndex]) {
  const previous = await load();
  await assert.rejects(save(payload, revision), { code });
  assert.deepEqual(await load(), previous);
}
before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email','test@example.com') $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
    create table public.existing_team_table(value text); insert into public.existing_team_table values ('preserved');`);
  for (const user of users) await db.query("insert into auth.users values ($1)", [user]);
  await db.exec(
    await readFile(
      new URL("../../supabase/migrations/202610250001_spendsense.sql", import.meta.url),
      "utf8",
    ),
  );
});
beforeEach(async () => {
  // Only the disposable test database is reset between tests.
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
  saved = [fixture(), fixture()];
  versions = [0, 0, 0];
  for (let i = 0; i < 2; i++) {
    await asUser(i);
    assert.equal(await load(), null);
    assert.ok((await save(saved[i], 0)) > 0);
  }
});
after(async () => await db.close());

test("migration installs on a clean PostgreSQL database with correct volatility and targeted SET NULL", async (t) => {
  t.diagnostic((await db.query("select version() as version")).rows[0].version);
  const functions = (
    await db.query(`select proname, provolatile from pg_proc
    where pronamespace = 'public'::regnamespace and proname like 'spendsense_%'`)
  ).rows;
  const volatility = Object.fromEntries(functions.map((row) => [row.proname, row.provolatile]));
  for (const name of [
    "json_number",
    "json_uuid",
    "json_date",
    "json_text",
    "valid_goal",
    "valid_purchase",
    "valid_analysis",
    "valid_behavior",
  ]) {
    assert.equal(volatility["spendsense_" + name], "i");
  }
  for (const name of ["json_timestamp", "valid_workspace", "load_workspace"])
    assert.equal(volatility["spendsense_" + name], "s");
  for (const name of ["profile_revision", "touch_workspace", "save_workspace"])
    assert.equal(volatility["spendsense_" + name], "v");
  assert.equal(
    (
      await db.query(
        "select provolatile from pg_proc where oid='pg_catalog.make_date(integer,integer,integer)'::regprocedure",
      )
    ).rows[0].provolatile,
    "i",
  );
  const constraints = (
    await db.query(`select pg_get_constraintdef(oid) as definition from pg_constraint
    where conrelid='public.spendsense_purchase_analyses'::regclass and contype='f'`)
  ).rows;
  assert.ok(
    constraints.some(
      (row) =>
        row.definition.includes("FOREIGN KEY (goal_id, user_id)") &&
        row.definition.includes("ON DELETE SET NULL (goal_id)"),
    ),
  );
});

test("date and timestamp validation is exception-safe across session settings", async () => {
  await asUser(0);
  try {
    for (const settings of [
      "set datestyle='ISO, MDY'; set timezone='UTC'",
      "set datestyle='SQL, DMY'; set timezone='Pacific/Apia'",
    ]) {
      await db.exec(settings);
      for (const [kind, valid, invalid] of [
        [
          "date",
          ["2024-02-29", "2026-10-25"],
          [
            "2023-02-29",
            "2026-02-30",
            "2026-13-01",
            "0000-01-01",
            "today",
            "infinity",
            "10/25/2026",
            "2026-1-1",
            "",
          ],
        ],
        [
          "timestamp",
          ["2026-10-25T12:00:00Z", "2024-02-29T23:59:59.123456+03:00"],
          [
            "2023-02-29T12:00:00Z",
            "2026-10-25T24:00:00Z",
            "2026-10-25T12:60:00Z",
            "2026-10-25T12:00:60Z",
            "2026-10-25T12:00:00",
            "2026-10-25T12:00:00+99:00",
            "2026-10-25T12:00:00Zjunk",
            "now",
            "infinity",
            "",
          ],
        ],
      ]) {
        for (const input of [...valid, ...invalid, null, {}, false, 12]) {
          const result = (
            await db.query(`select public.spendsense_json_${kind}($1::jsonb) as valid`, [
              JSON.stringify(input),
            ])
          ).rows[0].valid;
          assert.equal(result, valid.includes(input), `${kind}: ${JSON.stringify(input)}`);
        }
      }
      for (const createdAt of ["2026-02-30T12:00:00Z", "2026-10-25T12:00:00", "not a timestamp"]) {
        const next = structuredClone(saved[0]);
        next.analyses[0].createdAt = createdAt;
        await unchangedAfter(next);
      }
      const next = structuredClone(saved[0]);
      next.entries[0].date = "2026-02-30";
      await unchangedAfter(next);
      await save(saved[0]);
      assertLoadedWorkspace(await load());
      assert.equal((await load()).workspace.entries[0].date, "2026-10-25");
    }
  } finally {
    await db.exec("set datestyle='ISO, MDY'; set timezone='UTC'");
  }
});

test("profile revision assignment is trigger-owned and RPC returns the final multi-write revision", async () => {
  await asUser(2);
  await db.query(
    `insert into public.spendsense_user_profiles(user_id,income_range,savings_range,revision)
    values ($1,0,0,9000)`,
    [users[2]],
  );
  assert.equal((await load()).revision, 0);
  await db.query("update public.spendsense_user_profiles set revision=9999 where user_id=$1", [
    users[2],
  ]);
  assert.equal((await load()).revision, 1);
  await asUser(0);
  const old = versions[0];
  const next = structuredClone(saved[0]);
  next.entries[0].amount += 10;
  next.goals[0].saved += 10;
  const final = await save(next);
  assert.ok(final > old + 1); // Multiple child writes (including updated_at) advance the opaque token.
  assert.equal(final, (await load()).revision);
  await db.query("update public.spendsense_money_entries set amount=amount where id=$1", [
    next.entries[0].id,
  ]);
  assert.equal((await load()).revision, final);
  await db.query("update public.spendsense_user_profiles set revision=0 where user_id=$1", [
    users[0],
  ]);
  assert.equal((await load()).revision, final + 1); // The trigger increments once regardless of supplied value.
  versions[0] = final + 1;
  assert.ok((await save(next)) > final + 1);
  assert.equal(versions[0], (await load()).revision);
});

test("analyses without goals retain null calculation fields across repeated load/save", async () => {
  await asUser(0);
  const next = structuredClone(saved[0]);
  delete next.analyses[0].goalId;
  next.analyses[0].result = JSON.parse(
    JSON.stringify(analyze(next.analyses[0].purchase, next.profile, undefined)),
  );
  await save(next);
  const loaded = (await load()).workspace;
  assert.deepEqual(loaded.analyses[0].result, next.analyses[0].result);
  assert.equal(loaded.analyses[0].result.pctGoal, null);
  await commit(loaded);
  assert.deepEqual((await load()).workspace.analyses[0].result, next.analyses[0].result);
});

test("revision exhaustion rejects the write atomically instead of returning an unsafe JavaScript integer", async () => {
  // This administrative fixture change runs only in the disposable local DB and
  // is rolled back. Application clients cannot disable triggers or set revisions.
  await db.exec(
    "reset role; begin; alter table public.spendsense_user_profiles disable trigger spendsense_profile_revision",
  );
  try {
    await db.query(
      "update public.spendsense_user_profiles set revision=9007199254740991 where user_id=$1",
      [users[0]],
    );
    await db.exec(
      "alter table public.spendsense_user_profiles enable trigger spendsense_profile_revision",
    );
    await asUser(0);
    // A failed statement aborts this fixture transaction; rollback restores all rows.
    await assert.rejects(save(saved[0], Number.MAX_SAFE_INTEGER), { code: "23514" });
  } finally {
    await db.exec("rollback");
  }
  await asUser(0);
  assert.equal((await load()).revision, versions[0]);
});

test("all financial entities round trip through the React-compatible load contract", async () => {
  await asUser(0);
  const response = await load();
  assertLoadedWorkspace(response);
  assert.equal(response.workspace.entries[0].amount, 32000);
  assert.deepEqual(response.workspace.profile.habits, [0, 1, 2, 0]);
  assert.equal(response.workspace.goals[0].name, "Laptop");
  assert.equal(response.workspace.analyses[0].result.fit, 84);
  assert.equal(response.workspace.analyses[0].goalId, saved[0].goals[0].id);
  assert.equal(response.workspace.decisions[0].reflection, 4);
  assert.equal(response.workspace.waiting[0].analysisId, saved[0].analyses[0].id);
  assert.deepEqual(
    response.workspace.analyses[0].result,
    analyze(saved[0].analyses[0].purchase, saved[0].profile, saved[0].goals[0]),
  );
  assert.deepEqual(scores, Object.fromEntries(profileTubes(saved[0].profile.habits)));
});
test("income/expense CRUD and goal progress save and reload with the current frontend protocol", async () => {
  await asUser(0);
  const next = structuredClone((await load()).workspace);
  const expense = {
    id: randomUUID(),
    type: "expense",
    amount: 50.25,
    cat: "Food",
    name: "Lunch",
    date: "2026-10-25",
  };
  next.entries.push(expense);
  next.goals[0].saved = 35000;
  next.goals[0].status = "Completed";
  await commit(next);
  let loaded = (await load()).workspace;
  assert.equal(loaded.entries.find((entry) => entry.id === expense.id).amount, 50.25);
  assert.equal(loaded.goals[0].status, "Completed");
  loaded.entries.find((entry) => entry.id === expense.id).amount = 55;
  await commit(loaded);
  loaded = (await load()).workspace;
  assert.equal(loaded.entries.find((entry) => entry.id === expense.id).amount, 55);
  loaded.entries = loaded.entries.filter((entry) => entry.id !== expense.id);
  await commit(loaded);
  assert.equal((await load()).workspace.entries.length, 1);
});
test("even a nonempty partial collection cannot erase omitted records", async () => {
  await asUser(0);
  const complete = structuredClone((await load()).workspace);
  complete.entries.push({ ...complete.entries[0], id: randomUUID(), name: "Second income" });
  await commit(complete);
  const partial = structuredClone((await load()).workspace);
  partial.entries = partial.entries.slice(0, 1);
  await unchangedAfter({ ...partial, behaviorScores: scores });
});
test("RLS isolates reads and rejects owner forgery on all eight tables", async () => {
  await asUser(0);
  for (const table of tables) {
    const rows = (await db.query("select user_id from public.spendsense_" + table)).rows;
    assert.equal(rows.length, 1, table);
    assert.equal(rows[0].user_id, users[0]);
    await assert.rejects(
      db.query("update public.spendsense_" + table + " set user_id=$1 where user_id=$2", [
        users[1],
        users[0],
      ]),
      { code: "42501" },
    );
    await assert.rejects(
      db.query(
        `insert into public.spendsense_${table} select (jsonb_populate_record(null::public.spendsense_${table},to_jsonb(t)||jsonb_build_object('user_id',$1::text))).* from public.spendsense_${table} t where user_id=$2`,
        [users[1], users[0]],
      ),
      { code: "42501" },
    );
    if (table === "user_profiles")
      await assert.rejects(
        db.query("delete from public.spendsense_user_profiles where user_id=$1", [users[1]]),
        { code: "42501" },
      );
    else
      assert.equal(
        (
          await db.query(
            "delete from public.spendsense_" + table + " where user_id=$1 returning user_id",
            [users[1]],
          )
        ).rows.length,
        0,
      );
  }
});
test("every ID-based RPC upsert rejects another user's record without changing either workspace", async () => {
  await asUser(1);
  const otherBefore = await load();
  await asUser(0);
  for (const key of collections) {
    const attempted = structuredClone(saved[0]);
    attempted[key].push({ ...attempted[key][0], id: saved[1][key][0].id });
    await unchangedAfter(attempted, "42501");
  }
  await asUser(1);
  assert.deepEqual(await load(), otherBefore);
});
test("cross-owner analyses, goals and reflections cannot be linked", async () => {
  await asUser(0);
  const decision = structuredClone(saved[0]);
  decision.decisions[0].analysisId = saved[1].analyses[0].id;
  await unchangedAfter(decision, "23503");
  const goal = structuredClone(saved[0]);
  goal.analyses[0].goalId = saved[1].goals[0].id;
  goal.analyses[0].result.goal = { ...goal.analyses[0].result.goal, id: saved[1].goals[0].id };
  await unchangedAfter(goal, "23503");
  await assert.rejects(
    db.query(
      "insert into public.spendsense_purchase_reflections(decision_id,user_id,rating) values($1,$2,2) on conflict(decision_id) do update set rating=excluded.rating",
      [saved[1].decisions[0].id, users[0]],
    ),
    { code: "42501" },
  );
});
test("null, negative and stale revisions are rejected without side effects", async () => {
  await asUser(0);
  await unchangedAfter(saved[0], "22023", null);
  await unchangedAfter(saved[0], "22023", -1);
  await unchangedAfter(saved[0], "40001", 0);
});
test("missing, null, empty and truncated collections never imply deletion", async () => {
  await asUser(0);
  for (const key of collections) {
    for (const replacement of [undefined, null, []]) {
      const payload = structuredClone(saved[0]);
      payload[key] = replacement;
      await unchangedAfter(payload);
    }
  }
  const noManifest = { ...saved[0], deletions: null };
  await unchangedAfter(noManifest);
  const oldClient = { ...saved[0], schemaVersion: undefined };
  await unchangedAfter(oldClient);
});
test("duplicate IDs, contradictory delete lists and foreign deletion targets are rejected", async () => {
  await asUser(0);
  const duplicate = structuredClone(saved[0]);
  duplicate.entries.push({ ...duplicate.entries[0], id: duplicate.entries[0].id.toUpperCase() });
  await unchangedAfter(duplicate);
  const conflicting = {
    ...saved[0],
    deletions: { ...deletionList(), entries: [saved[0].entries[0].id] },
  };
  await unchangedAfter(conflicting);
  const foreign = {
    ...saved[0],
    deletions: { ...deletionList(), entries: [saved[1].entries[0].id] },
  };
  await unchangedAfter(foreign, "42501");
  const missingId = structuredClone(saved[0]);
  delete missingId.entries[0].id;
  await unchangedAfter(missingId);
});
test("JSON validators reject coercion, missing required fields, fractional money and invalid snapshots", async () => {
  await asUser(0);
  const corruptions = [
    (p) => (p.profile.income = "1"),
    (p) => (p.profile.onboarded = "true"),
    (p) => (p.profile.habits = [0, 1, 2, 9]),
    (p) => (p.behaviorScores = {}),
    (p) => (p.entries[0].amount = "32000"),
    (p) => (p.entries[0].amount = 0.001),
    (p) => (p.entries[0].name = "  "),
    (p) => (p.entries[0].date = "2026-02-30"),
    (p) => (p.analyses[0].purchase = {}),
    (p) => (p.analyses[0].purchase.price = "NaN"),
    (p) => (p.analyses[0].purchase.own = "false"),
    (p) => (p.analyses[0].purchase.reasons = ["need", "need"]),
    (p) => (p.analyses[0].result = {}),
    (p) => delete p.analyses[0].result.fit,
    (p) => (p.analyses[0].result.fit = 12),
    (p) => (p.analyses[0].createdAt = "infinity"),
    (p) => (p.decisions[0].reflection = 1.5),
    (p) => (p.waiting[0].review = "2026-10-01"),
  ];
  for (const corrupt of corruptions) {
    const payload = structuredClone(saved[0]);
    corrupt(payload);
    await unchangedAfter(payload);
  }
});
test("direct JSONB inserts and NaN numeric writes are also constrained", async () => {
  await asUser(0);
  await assert.rejects(
    db.query("update public.spendsense_purchase_analyses set purchase='{}'::jsonb where id=$1", [
      saved[0].analyses[0].id,
    ]),
    { code: "23514" },
  );
  await assert.rejects(
    db.query("update public.spendsense_purchase_decisions set purchase='{}'::jsonb where id=$1", [
      saved[0].decisions[0].id,
    ]),
    { code: "23514" },
  );
  await assert.rejects(
    db.query("update public.spendsense_spending_profiles set scores='{}'::jsonb where user_id=$1", [
      users[0],
    ]),
    { code: "23514" },
  );
  await assert.rejects(
    db.query("update public.spendsense_money_entries set amount='NaN'::numeric where id=$1", [
      saved[0].entries[0].id,
    ]),
    { code: "23514" },
  );
  await assert.rejects(
    db.query("update public.spendsense_money_entries set entry_date='infinity'::date where id=$1", [
      saved[0].entries[0].id,
    ]),
    { code: "23514" },
  );
  await assert.rejects(
    db.query("update public.spendsense_purchase_analyses set result=result-'goal' where id=$1", [
      saved[0].analyses[0].id,
    ]),
    { code: "23514" },
  );
});
test("direct Data API edits advance revisions so cached snapshots cannot erase them", async () => {
  await asUser(0);
  const stale = versions[0];
  await db.query("update public.spendsense_money_entries set amount=33000 where id=$1", [
    saved[0].entries[0].id,
  ]);
  assert.ok((await load()).revision > stale);
  await unchangedAfter(saved[0], "40001", stale);
  assert.equal((await load()).workspace.entries[0].amount, 33000);
});
test("explicit goal deletion nulls only the owned live reference and preserves analysis history", async () => {
  await asUser(0);
  const next = structuredClone((await load()).workspace);
  next.goals = [];
  await commit(next);
  const result = await load();
  assert.equal(result.workspace.goals.length, 0);
  assert.equal(result.workspace.analyses[0].goalId, undefined);
  assert.equal(result.workspace.analyses[0].result.goal.id, saved[0].goals[0].id);
  assert.equal(
    (await db.query("select user_id from public.spendsense_purchase_analyses")).rows[0].user_id,
    users[0],
  );
  await asUser(1);
  assert.equal((await load()).workspace.goals.length, 1);
});
test("direct goal deletion has the same ownership-safe SET NULL behavior", async () => {
  await asUser(0);
  const revision = versions[0];
  await db.query("delete from public.spendsense_savings_goals where id=$1", [saved[0].goals[0].id]);
  assert.equal((await load()).workspace.analyses[0].goalId, undefined);
  assert.equal((await load()).workspace.analyses[0].result.goal.id, saved[0].goals[0].id);
  assert.ok((await load()).revision > revision);
});
test("omitting a reflection requires explicit intent; reflected ratings remain separately persistent", async () => {
  await asUser(0);
  const next = structuredClone((await load()).workspace);
  delete next.decisions[0].reflection;
  await unchangedAfter({ ...next, behaviorScores: scores });
  await commit(next);
  assert.equal((await load()).workspace.decisions[0].reflection, undefined);
  await commit(saved[0]);
  assert.equal((await load()).workspace.decisions[0].reflection, 4);
});
test("atomic decisions, waiting updates, Undo and explicit reset preserve other users", async () => {
  await asUser(0);
  const changed = structuredClone((await load()).workspace);
  changed.decisions[0].decision = "Buy";
  changed.decisions[0].reflection = 5;
  changed.waiting = [];
  await commit(changed);
  assert.equal((await load()).workspace.decisions[0].reflection, 5);
  assert.equal((await load()).workspace.waiting.length, 0);
  await commit(saved[0]);
  assert.equal((await load()).workspace.waiting.length, 1);
  await commit({ ...saved[0], entries: [], goals: [], waiting: [], decisions: [], analyses: [] });
  assert.equal((await load()).workspace.entries.length, 0);
  assert.equal((await load()).workspace.decisions.length, 0);
  await asUser(1);
  assert.equal((await load()).workspace.entries.length, 1);
});
test("new authenticated accounts can save incomplete onboarding then complete it without demo data", async () => {
  await asUser(2);
  assert.equal(await load(), null);
  const next = {
    ...fixture(),
    profile: { ...fixture().profile, onboarded: false, habits: [] },
    behaviorScores: {},
    entries: [],
    goals: [],
    analyses: [],
    decisions: [],
    waiting: [],
  };
  await save(next, 0);
  assertLoadedWorkspace(await load());
  assert.equal((await load()).workspace.entries.length, 0);
  next.profile.habits = [0, 1, 2, 0];
  next.profile.onboarded = true;
  next.behaviorScores = scores;
  await save(next);
  assert.equal((await load()).workspace.profile.onboarded, true);
});
test("account-switch requests and anonymous access are denied, existing unrelated tables are preserved", async () => {
  await asUser(1);
  await unchangedAfter({ ...saved[0], ownerId: users[0] }, "42501");
  assert.equal(
    (await db.query("select public.spendsense_load_workspace($1::uuid) as result", [users[0]]))
      .rows[0].result,
    null,
  );
  await db.exec("reset role; set role anon");
  for (const table of tables)
    await assert.rejects(db.query("select * from public.spendsense_" + table), { code: "42501" });
  await assert.rejects(db.query("select public.spendsense_load_workspace($1::uuid)", [users[0]]), {
    code: "42501",
  });
  await db.exec("reset role");
  assert.equal(
    (await db.query("select value from public.existing_team_table")).rows[0].value,
    "preserved",
  );
});
