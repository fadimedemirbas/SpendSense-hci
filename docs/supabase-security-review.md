# Supabase security and data integrity review

Reviewed the prepared, undeployed `202610250001_spendsense.sql` migration and
the current Figma Make React persistence code. No remote migration, remote schema
change, commit, or push was performed. Existing unrelated database objects and
backend files are preserved. The frontend design and interactions are unchanged.

## Corrections

- **Cross-user upserts:** every conflict-update branch explicitly restricts the
  target row to `auth.uid()`. ID-based writes require exactly one affected row.
  All eight tables continue to enforce owner-only RLS for reads and writes, and
  the workspace RPCs run as the caller, with an additional expected-account check.
  Composite foreign keys prohibit references to another user's records.
- **Incomplete snapshots:** saves now require protocol version 1, every collection,
  and explicit deletion lists. Every existing row must be retained or explicitly
  deleted. Missing, null, or truncated collections cannot implicitly delete rows.
  Conflicting or foreign deletion IDs reject the entire transaction. The React
  helper computes deletion intent from the previous successfully loaded state;
  malformed load responses never become empty writable state.
- **Stale snapshots:** a non-null, safe integer revision is mandatory and checked
  while holding the profile lock. Revision triggers also invalidate snapshots
  after direct Data API writes, including profile edits. The frontend uses the
  actual returned revision. Profile deletion is unavailable to authenticated
  clients; the existing reset flow still works.
- **JSONB validation:** required keys, JSON types, enums, finite dates, UUIDs,
  unique IDs, money precision/ranges, questionnaire answers/scores, purchase
  fields, and analysis factor totals are checked. Validators return false for
  missing values rather than allowing SQL CHECK's null behavior. Table constraints
  also protect direct writes, including against numeric NaN and infinite dates.
- **Goals and analyses:** `(goal_id, user_id)` references the owned savings goal.
  The analysis snapshot must match its live goal reference. Goal deletion clears
  only `goal_id`; the historical calculation snapshot remains available. The React
  payload builder mirrors this behavior without masking a newly invalid reference.

Explicit owner-authorized deletions, Undo, and reset remain supported. The server
cannot infer intent if a client explicitly requests deletion of valid owned IDs;
the protection is against implicit deletion through omission and stale writes.
Analysis scores remain client-generated reflection aids, not authoritative
financial calculations. Existing export scoring and UI behavior are preserved.

## Local verification

Tests execute the actual migration in a disposable PGlite PostgreSQL database,
with separate authenticated identities and an anonymous role. Coverage includes:

- Isolation on all eight tables, forged owners, foreign upserts and relationships.
- Complete save/load round trips using the actual React analysis/scoring functions.
- New-user onboarding, income/expense CRUD, goal progress, decisions, waiting
  items, reflections, Undo, and reset.
- Atomic rollback, omitted data, deletion conflicts, stale/null revisions,
  malformed JSON, and direct table-write constraints/revision changes.
- Auth signup/login contracts and configuration checks using test doubles;
  logout wiring was inspected, but live logout remains unverified.
- Preservation of unrelated tables and immutable historical goal snapshots.

Run from `frontend/`: `npm test`, `npm run typecheck`, `npm run build`, and
`npm run format:check`. There is no separate lint script in this frontend.

Final results after the PostgreSQL compatibility follow-up: all 31 tests passed;
TypeScript, production build, formatting,
and `git diff --check` passed. Vite reports one non-blocking warning for the
approximately 542 kB JavaScript bundle. Git reports only line-ending notices.
See [the PostgreSQL compatibility review](supabase-postgresql-compatibility.md)
for corrected function volatility, timestamp validation, and revision details.

## Deployment status

The corrected migration is suitable for an approved staging deployment after
the project owner checks shared-schema name collisions and PostgreSQL 15+
compatibility. It creates new prefixed tables rather than altering unknown
existing tables. It is not a follow-up migration for an already deployed version;
if any earlier draft was applied elsewhere, prepare a separate reviewed upgrade.

Production readiness still requires checking the existing project's actual
schema, Auth settings, and live two-user signup/login/logout and CRUD/RLS smoke
tests. The local Publishable Key is not configured, so these live checks were
not performed. No local test proves email delivery or remote project settings.
Do not deploy remotely without the user's approval.

The column-specific null action is documented in
[PostgreSQL CREATE TABLE](https://www.postgresql.org/docs/15/sql-createtable.html).
