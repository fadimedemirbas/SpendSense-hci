# SpendSense Supabase Integration

The existing SpendSense Supabase project is the only deployment target:
`https://ahggqvqkpkfwchqdcaaa.supabase.co`.

No Supabase project has been created, no remote schema inspected, and no remote
migration has been executed by this work. The migration is proposed for review.

## Environment

Install dependencies with `npm ci` from `frontend/`. The ignored
`frontend/.env.local` contains the project URL and an empty Publishable Key
slot. Populate `VITE_SUPABASE_PUBLISHABLE_KEY` with the project's
`sb_publishable_...` key and restart Vite. `frontend/.env.example` documents the
variable names without real credentials. Production builds need both variables
in their build environment.

Only publishable keys are accepted by the browser configuration. Never use
a secret key, legacy service-role key, database password, or connection string
in any `VITE_*` variable. Vite exposes those variables to the browser.
Vite also rejects an incorrectly configured key before serving or bundling it;
the rejection message does not include the key value. A missing key leaves the
app in its signed-out state and displays setup feedback when authentication is attempted.

## Migration Review Before Approval

Review `migrations/202610250001_spendsense.sql` alongside the team's actual
remote schema. It creates eight new prefixed tables, two RPC functions, and
validation/revision helpers and triggers. PostgreSQL 15 or newer is required
for the column-specific foreign-key `ON DELETE SET NULL` action.
Name collisions fail the whole migration rather than modifying an existing
table. If the team already has equivalent tables, agree on mappings before
applying this proposal; it does not migrate unknown existing data.

| Proposed table | Data |
| --- | --- |
| `spendsense_user_profiles` | Auth user ID, income/savings range indices, onboarding, currency, revision |
| `spendsense_money_entries` | Income/expense entries, amount, category, name, date |
| `spendsense_savings_goals` | Target, saved amount, status, optional deadline |
| `spendsense_spending_profiles` | Current Figma Make questionnaire answers and behavioral scores |
| `spendsense_purchase_analyses` | Purchase and calculation snapshots, optional historical goal ID |
| `spendsense_purchase_decisions` | Buy/Wait/Skip decisions linked to owned analyses |
| `spendsense_purchase_reflections` | 1-5 ratings linked to owned decisions |
| `spendsense_waiting_items` | Waiting purchases linked to owned analyses and review dates |

Historical analysis snapshots retain goal context even after a goal is deleted.
The optional live `goal_id` uses an owner-scoped composite foreign key; deleting
the goal clears only that reference and preserves the JSON snapshot. Child
decision/reflection/waiting references enforce ownership using composite foreign
keys. All eight tables enable and force RLS; policies use `auth.uid()` for both
`USING` and `WITH CHECK`. Anonymous roles have no table or RPC access.

The RPCs run as the caller (`SECURITY INVOKER`) and do not bypass RLS. Every
save derives the owner from `auth.uid()`, never from submitted JSON. An additional
expected-user check rejects requests still in flight during an account switch.
Saving a
workspace reconciles only that user's rows in one transaction. Protocol version 1
requires all collections and an explicit deletion manifest built from the last
loaded workspace. Omitting saved records without declaring their deletion rejects
the entire save; empty or truncated arrays alone cannot erase existing records.
This includes user-requested deletes/reset and Undo; merely applying the migration
deletes no financial data. A locked, mandatory revision rejects stale browser tabs.
Direct table writes also advance the revision through triggers. Treat revisions
as opaque tokens rather than assuming each save increments by exactly one.
Reload data after a conflict or uncertain network save. Authenticated clients
cannot delete the profile row; reset operates on the user's financial records.

After explicit approval, the teammate managing the project can apply the reviewed
file through the project's normal migration workflow. Do not run `db reset`,
create a new project, or use an automatic push as part of frontend installation.
The shared database must be backed up and its existing object names checked by
the project owner before an approved deployment.

## Auth Configuration

Keep email/password authentication enabled on the existing project. Configure
the Auth Site URL and allowed Redirect URLs for the actual local and production
origins (for example `http://localhost:5173` and the local preview
`http://127.0.0.1:5176`). Registration uses `signUp`; when confirmation is enabled,
the UI asks the user to confirm email and log in. It does not enter the financial
workspace without a session. Login uses `signInWithPassword`, logout uses local
session sign-out, and session changes unmount and clear the previous user's
financial state and toasts. Passwords are never stored by application code.

No Auth dashboard settings were changed. Password recovery and social auth are
outside this integration's scope.

## Frontend Persistence

The current Figma Make UI is retained. Account registration/login share its
existing account form; protected onboarding resumes at the financial ranges.
Retaking questions and existing CRUD interactions continue to use its screens.
The old frontend and its scoring utility are not imported or restored.

`src/lib/supabase.ts` creates the reusable client. `useWorkspace.ts` serializes
saves, commits visible state only after database confirmation, and blocks stale
or failed writes until reload. Success toasts follow successful saves. Purchases
save their analysis before displaying results. Decisions and waiting updates are
atomic; reflections persist in their own table. Settings save ranges/currency;
reset empties the signed-in user's saved records rather than inserting demo data.

New users start with empty collections. Old `ss.entries`, `ss.goals`, `ss.profile`,
`ss.waiting`, and `ss.decisions` browser-local prototype data is neither read nor
automatically uploaded. Language and installation/checklist preferences may stay
local. Analysis and questionnaire scores preserve the current export's heuristic
model, tagged `figma-make-v1`; they are client-generated reflection aids, not
trusted financial calculations or a clinical profile.

## Verification and Limits

From `frontend/`:

Use Node.js 22.18 or newer so Node's test runner can load the TypeScript modules.

```sh
npm test
npm run typecheck
npm run build
npm run format:check
npm run dev
```

Database tests execute the actual migration in an isolated in-memory PostgreSQL
runtime. They test all eight tables' owner isolation, anonymous denial, forged
ownership, cross-user upserts/references, round trips, revision conflicts,
rollback, atomic decisions/Undo/reset, and preservation of unrelated tables.
Auth contract tests use test doubles only inside tests; production has no mock
backend or seeded financial records.

Live registration, email delivery, logout, deployed RLS, and persistent browser
CRUD still require the actual Publishable Key and an explicitly approved remote
migration. Do not interpret passing local tests as confirmation of the shared
project's configuration. The current snapshot-based RPC suits this prototype;
large datasets should move to paginated reads and granular mutations in a future
agreed API revision.

The production build currently emits a non-blocking bundle-size warning after
adding the Supabase SDK. Type checking and the build complete without errors.
Browser checks cover signed-out login/registration, keyboard submission,
validation, missing-key feedback, and mobile layout. The expanded local test suite
covers Auth/configuration contracts, the React save protocol, malformed JSON,
explicit deletions, direct-write revision changes, and proposed database behavior.
See `../docs/supabase-security-review.md` for the final review and deployment gates.
The final PostgreSQL compatibility review is in
`../docs/supabase-postgresql-compatibility.md`; it covers function volatility,
date/timestamp input, trigger-owned revisions, and first-deployment prerequisites.

References: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[Auth session events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
