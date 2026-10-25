# Final PostgreSQL compatibility review

The corrected migration is ready for a **first deployment to an empty Supabase
application database running PostgreSQL 15 or newer**, subject to approval. No
remote SQL was executed. An empty Supabase application database still includes
Supabase's `auth.users`, `auth.uid()`, `auth.jwt()`, `anon`, and `authenticated`;
these are prerequisites. A bare PostgreSQL database needs those prerequisites
provided separately, as the disposable test harness does.

## Function volatility and invalid input

- Date validation uses a strict `YYYY-MM-DD` shape, integer components and
  `make_date`. It no longer calls text-to-date input or `to_char`, so its
  `IMMUTABLE` label is valid without relying on DateStyle or TimeZone.
- Timestamp validation and its calling workspace validator are `STABLE`, not
  `IMMUTABLE`. Timestamp input is restricted to a real calendar date, ordinary
  clock time, optional microseconds, and an explicit `Z` or numeric offset.
  Relative timestamps, missing zones, impossible dates, rollover clock times,
  and trailing input are rejected. Conversion errors return false inside the
  validator; malformed save payloads produce controlled SQLSTATE `22023` before
  any mutations.
- Remaining immutable validators use JSON, numeric, text and UUID checks, with
  no session-dependent date/timestamp conversion. The read RPC is `STABLE`;
  write RPC and revision triggers are explicitly `VOLATILE`.
- Save/load RPCs pin DateStyle to `ISO, YMD` and TimeZone to `UTC`. The timestamp
  helper pins the same settings. Tests vary caller DateStyle and TimeZone.

## Revisions and frontend compatibility

The profile trigger alone assigns revisions: zero on insertion, previous value
plus one on update, ignoring client-supplied revision values. The write RPC no
longer contains a second revision assignment. Child writes update the profile
through a non-recursive trigger; updating the profile does not invoke a child
trigger. Actual no-op child writes skip revision advancement. Upserts that refresh
an `updated_at` field may advance it, so revision differences are not counts of
user actions.

The RPC locks and checks the expected profile revision, performs all changes,
then reads and returns the final stored revision after all triggers complete.
React assigns that returned value directly and now rejects malformed or unsafe
revision responses. It never assumes `previous + 1`. The safe integer bound fails
closed on exhaustion and rolls back the transaction.

A further round-trip fix preserves nested JSON nulls in analysis results. Removing
an absent top-level `goalId` must not recursively remove required nullable fields
such as `pctGoal`. Real frontend calculations without goals now survive repeated
save/load cycles. No Figma Make design, navigation, or scoring changes were made.

## Version support and initial deployment

The migration requires PostgreSQL 15+ and checks the version. The composite
`(goal_id, user_id)` foreign key uses `ON DELETE SET NULL (goal_id)`, supported
since PostgreSQL 15. This clears only the optional goal reference, retaining the
non-null owner ID and historical JSON snapshot. Both the constraint definition
and its direct-delete behavior are covered by local tests.

Supabase documents PostgreSQL 17 as its current platform default and also supports
PostgreSQL 15 builds. The existing shared project's actual server version was
not queried. This migration uses no PostgreSQL 18-only feature or extra extension.
Local execution uses PostgreSQL 18.6 through PGlite; separate 15/17 execution
was unavailable because the local Docker engine was not running. Compatibility
with those versions is based on the documented SQL feature baseline, not a claimed
15/17 runtime test.

The entire migration successfully installs on a clean disposable database with
Supabase Auth prerequisites. Objects are created in dependency order inside one
transaction. It intentionally fails on existing object names and is not rerunnable
or an upgrade path for a previously deployed draft. Apply through a role authorized
to create these objects and grant permissions, such as the normal Supabase migration
role. No initial deployment blocker was found under these prerequisites.

## Verification

From `frontend/`, run `npm test`, `npm run typecheck`, `npm run build`, and
`npm run format:check`. There is no separate lint script. The tests include clean
installation, function volatility, invalid date/timestamp inputs, session settings,
revision assignment/exhaustion, final-returned revisions, no-goal round trips,
multi-user RLS, ownership checks, and the existing Auth and financial CRUD tests.
Live Auth delivery and remote configuration remain untested and should be checked
after an approved deployment.

Final result: **31/31 tests passed** on PostgreSQL 18.6 (PGlite). Type checking,
production build, formatting, and `git diff --check` passed. The build retains
one non-blocking bundle-size warning; Git reports line-ending notices only.

References:

- [PostgreSQL function volatility](https://www.postgresql.org/docs/current/xfunc-volatility.html)
- [PostgreSQL date/time input](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [PostgreSQL 15 foreign-key syntax](https://www.postgresql.org/docs/15/sql-createtable.html)
- [Supabase PostgreSQL versions](https://github.com/supabase/postgres/blob/develop/README.md)
- [Supabase PostgreSQL 17 platform default](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)
