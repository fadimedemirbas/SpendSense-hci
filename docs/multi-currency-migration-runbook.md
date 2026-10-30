# Multi-currency migration runbook (`202610280001`)

This runbook applies `supabase/migrations/202610280001_spendsense_currency.sql` to a
SpendSense database that already has `202610250001_spendsense.sql`. Nothing in this
repository applies it automatically. Every step that touches a real database is
performed by the project owner after explicit approval.

## What the migration does

- Adds `currency` to `spendsense_money_entries` and `spendsense_savings_goals`, and
  `display_currency` to `spendsense_user_profiles` (`not null default 'TRY'`,
  checked to `TRY`/`USD`/`EUR`). Existing rows read as `TRY`; nothing is rewritten,
  converted or deleted. The existing `currency` column of profiles (symbol/code
  display format) keeps its meaning.
- Replaces the validators and workspace RPCs, adds `spendsense_load_workspace_v3`
  and three helper functions, and creates the private ledger
  `spendsense_meta.schema_migrations`.
- RLS policies, FORCE RLS and table grants are unchanged.

### Client protocols

| Client | Load | Save | Account holds USD/EUR records |
| --- | --- | --- | --- |
| Protocol 1: TRY-only screens (every release up to the currency UI) | `spendsense_load_workspace(uuid)`, migration-1 response | `schemaVersion: 1`, TRY only | load and save refused with `0A000` |
| Protocol 3: currency-aware screens (Phase 5) | `spendsense_load_workspace_v3(uuid, 3)` | `schemaVersion: 3`, currency on every record | works |
| Anything else (`schemaVersion` 2, 4, …) | — | rejected with `22023` | — |

"USD/EUR records" means any non-TRY money entry, savings goal, purchase in an
analysis, decision or waiting item, or goal snapshot inside analysis history. A
non-TRY display currency alone does not block protocol 1, because those clients
show correct lira amounts and never write the display currency.

The frontend's protocol is `CLIENT_PROTOCOL` in
`frontend/src/lib/workspaceProtocol.ts`. It is `3` since the currency-aware
screens shipped (Phase 5), so that build must only be deployed after this
migration is applied and verified in production (see "Deployment order").

## Required migration role

Run the migration and the rollback as a role that:

1. bypasses RLS (`rolsuper` or `rolbypassrls`), because all eight tables use
   FORCE RLS and an RLS-bound owner would see no rows at all; and
2. owns the eight `spendsense_*` tables (or is a member of the owning role).

In the Supabase SQL Editor this is `postgres` (`rolsuper = false`,
`rolbypassrls = true`, owner of the tables), as verified on 2026-10-28. Any other
role is refused with `42501` before anything changes. As a second safeguard the
script sets `row_security = off` for its transaction, so a query that RLS would
filter raises an error instead of silently returning fewer rows.

## Prerequisites

- [ ] Approval to change the production database.
- [ ] Backup (see below) taken and stored securely. It contains personal financial
      data.
- [ ] Supabase plan checked for automatic backups and point-in-time recovery; do
      not assume either exists.
- [ ] Rehearsal on a local Supabase stack or staging project completed (below).
- [ ] Low-traffic window chosen. Adding the checked columns takes a brief
      exclusive lock and scans each table once.
- [ ] The release that will follow is a protocol 1 build (`CLIENT_PROTOCOL = 1`).

### Backup

From a trusted machine with the database connection string from the Supabase
dashboard (never commit it, never put it in a `VITE_` variable):

```sh
pg_dump "$DATABASE_URL" --format=custom --no-owner \
  --schema=public --file=spendsense-before-202610280001.dump
```

Use a `pg_dump` with the same major version as the server (17), and verify that the
dump can be listed (`pg_restore --list spendsense-before-202610280001.dump`).

## Staging rehearsal

No staging configuration exists in this repository yet. Use either:

- **Local Supabase stack:** install the Supabase CLI and Docker, run `supabase init`
  (adds `supabase/config.toml`; commit only after review) and `supabase start`
  with PostgreSQL 17. Apply `202610250001` through the local SQL editor or `psql`
  as `postgres`.
- **Staging project:** a separate Supabase project on PostgreSQL 17 with the same
  Auth settings. Apply `202610250001` the same way production received it (SQL
  Editor). Point a Netlify deploy preview at it with its own
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`.

Then:

1. Create two test accounts with the current production frontend and enter
   synthetic data: entries, a goal, Decide analyses with Buy/Wait/Skip, a reflection.
   Never copy production personal data into staging.
2. Run the production preflight queries below and keep the output.
3. Apply `202610280001` in the SQL editor as `postgres`. Expect success.
4. Run the post-migration checks below.
5. Use both test accounts with the current frontend (protocol 1): load, add, edit,
   delete, Undo, Decide, Waiting, History. Everything must behave as before.
6. Run the rollback script, check that the post-rollback state matches the
   preflight output, use the app again, then re-apply the migration.
7. Keep an older frontend tab open across the migration and confirm it keeps
   working for a lira-only account.

## Production preflight (read-only)

Run in the SQL Editor as `postgres`. Stop if any result differs from the expected
value.

```sql
select version();                                   -- PostgreSQL 17.x
select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user;
                                                    -- postgres, false, true
select c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c where c.relnamespace = 'public'::regnamespace
  and c.relname like 'spendsense_%' and c.relkind = 'r' order by 1;
                                                    -- 8 rows, postgres, true, true
select table_name, column_name from information_schema.columns
  where table_schema = 'public' and table_name like 'spendsense_%'
  and column_name in ('currency','display_currency');
                                                    -- only spendsense_user_profiles.currency
select to_regnamespace('spendsense_meta');          -- null (no ledger yet)
select proname, md5(replace(prosrc, E'\r', '')) from pg_proc
  where pronamespace = 'public'::regnamespace and proname like 'spendsense_%' order by 1;
                                                    -- the 14 values embedded in the migration
-- Row counts and totals to compare after the migration:
select 'entries', count(*), sum(amount) from public.spendsense_money_entries
union all select 'goals', count(*), sum(target) from public.spendsense_savings_goals
union all select 'analyses', count(*), null from public.spendsense_purchase_analyses
union all select 'decisions', count(*), null from public.spendsense_purchase_decisions
union all select 'waiting', count(*), null from public.spendsense_waiting_items
union all select 'profiles', count(*), null from public.spendsense_user_profiles;
-- Must be 0: purchases that already carry a currency key.
select count(*) from public.spendsense_purchase_analyses where purchase ? 'currency';
```

The migration re-checks all of this itself and aborts on any mismatch; the queries
let you stop before changing anything and give a baseline to compare against.

## Applying

1. Open the SQL Editor as `postgres`.
2. Paste the **whole** file `supabase/migrations/202610280001_spendsense_currency.sql`
   and run it once. It is one transaction (`begin` … `commit`).
3. Any error means nothing was changed:

| Error | Meaning | Action |
| --- | --- | --- |
| `42501` … bypasses RLS | wrong role | run as `postgres` |
| `42501` … is owned by | tables owned by another role | stop, inspect ownership |
| `55000` … is missing / not enabled and forced | baseline differs | stop, inspect |
| `55000` … differs from migration 202610250001 | a migration-1 function was changed | stop, compare the function definition |
| `55000` … already applied / already exist | migration (or a draft) ran before | stop, inspect the ledger and columns |
| `23514` … currency rules | stored data fails the new validators | stop, find the rows (preflight query) |
| `0A000` … PostgreSQL 15 | server too old | stop |

## Post-migration verification (read-only)

```sql
select version, name, status, recorded_at, recorded_by
  from spendsense_meta.schema_migrations order by version;
  -- 202610250001 baseline-verified, 202610280001 applied
select table_name, column_name, column_default, is_nullable from information_schema.columns
  where table_schema = 'public' and column_name in ('currency','display_currency') order by 1, 2;
select currency, count(*) from public.spendsense_money_entries group by 1;   -- only TRY
select currency, count(*) from public.spendsense_savings_goals group by 1;   -- only TRY
select display_currency, count(*) from public.spendsense_user_profiles group by 1; -- only TRY
-- Re-run the row count/total query from the preflight: identical results.
select has_schema_privilege('authenticated', 'spendsense_meta', 'USAGE'),
       has_schema_privilege('anon', 'spendsense_meta', 'USAGE');           -- false, false
```

Then sign in to the production app with a test account and load, add and delete an
entry. Watch the Supabase logs for `0A000`, `22023`, `40001`, `42501` and
`PGRST202` during the following 48 hours.

## Deployment order

1. Rehearse on staging (above).
2. Back up production.
3. Apply `202610280001` to production; run the post-migration checks.
4. Deploy the protocol 1 frontend (current `main`). It works with and without the
   migration, so steps 3 and 4 may also run in the opposite order.
5. Only after the migration is verified in production: release the currency-aware
   screens together with `CLIENT_PROTOCOL = 3` (Phase 5). A protocol 3 build on an
   unmigrated database stops with "The database setup is not ready" (missing RPC)
   instead of guessing.

## Rollback and recovery

### Window A: migration applied, no USD/EUR data yet

Run `supabase/rollback/202610280001_spendsense_currency_rollback.sql` in the SQL
Editor as `postgres`. It refuses to run if any account holds a non-TRY record or
display currency, and if the ledger does not list the migration as applied. In one
transaction it restores the six migration-1 functions verbatim, drops the four new
functions and the three columns, verifies all 14 migration-1 function hashes and
marks the ledger entry `reverted`. Rows, IDs and amounts are untouched. Purchases
saved meanwhile may keep a `"currency": "TRY"` key, which migration 1 accepts. The
migration can be applied again later.

### Window B: USD/EUR data exists

**Do not run the rollback script and never drop the currency columns**: every
USD/EUR amount would then read as lira.

- Frontend problems: redeploy an earlier frontend. Older (protocol 1) builds are
  refused for multi-currency accounts by the database and keep working for
  lira-only accounts, so a frontend rollback cannot corrupt data.
- Database problems: write and review a forward fix (a new migration).
- Data corruption: restore from backup as a last resort; data written after the
  backup is lost.

## The private ledger vs. Supabase CLI history

| | `spendsense_meta.schema_migrations` | `supabase_migrations.schema_migrations` |
| --- | --- | --- |
| Written by | the SpendSense migration and rollback scripts | the Supabase CLI (`db push`, `migration repair`) |
| Exists in production | after `202610280001` | no |
| Purpose | verified baseline, repeat protection, rollback state | CLI's record of applied files |
| Client access | none (`anon`, `authenticated`, `service_role` revoked; not exposed by the API) | — |

The CLI does not read the private ledger. If the team adopts the CLI later, do not
run `db push` against production until the CLI history has been aligned with the
ledger (for example with `supabase migration repair --status applied` for both
versions, as a separate approved step). Otherwise the CLI would try to apply
`202610250001` again, which fails on the existing tables.

## Local tests

`npm test` in `frontend/` runs, on local PGlite (PostgreSQL 18):

- `supabase-database.test.mjs` on migration 1 and, via
  `supabase-database-migrated.test.mjs`, the same assertions on migration 1 + 2;
- `supabase-currency-migration.test.mjs`: data preservation, baseline and hash
  checks, repeat protection, protocols 1/2/3, legacy read/write protection for
  every monetary surface, RLS, locking, deletions and history;
- `supabase-migration-roles.test.mjs`: non-superuser owners with and without
  BYPASSRLS, `row_security = off`, ownership;
- `supabase-currency-rollback.test.mjs`: rollback in window A and its refusals;
- `workspace-protocol-db.test.mjs`: the frontend serializer end to end.

These tests do not prove production compatibility: PostgreSQL 17, the Supabase
roles, PostgREST and Auth are only exercised by the staging rehearsal.
