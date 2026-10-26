# Figma Make Frontend Migration

Source: `Build SpendSense Finance Companion.zip`, imported on 2026-10-25.

## Before replacement

The checkout was on `develop`, with uncommitted frontend changes. All twelve
top-level files under the export's `src/` already matched those working files
byte for byte. A copy of the entire previous frontend, excluding generated
`node_modules/` and `dist/`, was saved in the ignored local archive
`.migration-backups/frontend-before-figma-make.zip` outside the served frontend.

The tracked legacy frontend was also inspected before removal. Neither the
tracked implementation nor the working frontend initialized a Supabase client,
called HTTP APIs, or used environment variables for backend requests. The old
package manifest included `@supabase/supabase-js`, but source code did not use it.
No backend server, database schema, API endpoint implementation, or `.env` file
was found in this checkout. Consequently there are no working backend
integrations to port, and no backend or environment files require changes.

## Replacement scope

The export's `src/` and `public/` are the sole frontend implementation. Legacy
onboarding pages, components, styles, assets, scoring utility, its tests, and
shadcn configuration are removed after verifying that the export imports none
of them. Existing repository documentation remains intact as project history;
its former onboarding/scoring descriptions do not describe the new export.

The new frontend retains the export's onboarding, finance tracking, goals,
purchase reflection, waiting list, history, insights, settings, English/Turkish
support, dialogs, animations, guided tour, and PWA installation help.

## Data and API status

The export persists data in browser local storage using `ss.*` keys. Its sample
transactions and goals are supplied by the export, not a replacement for an
existing backend. Registration and login are local prototype interactions;
they do not authenticate users or create server accounts. The export's
purchase analysis and profile calculations are retained without merging the
previous frontend's algorithms. Real backend integration requires an actual
API contract and configured service, neither of which exists in this checkout.

## Local tooling

The application stays in `frontend/`. Its Vite setup supports React, Tailwind,
and the `@` source alias without Figma's hosted-preview instrumentation. The
HTML shell retains the export's PWA metadata and site description. npm supplies
the reproducible dependency lockfile. No export instructions or hosted Figma
deployment scripts are needed to run the application locally.

Run from `frontend/`:

```sh
npm ci
npm run dev
npm run typecheck
npm run build
npm run preview
```

The export has no lint command. `npm run format:check` checks formatting only;
it is not a semantic lint check.

## Compatibility and verification

- Added `typecheck` and `format:check` scripts. Removed the obsolete TypeScript
  `baseUrl` option; the source alias remains defined through `paths` and Vite.
- Updated the export's oxfmt dependency from 0.2 to 0.74 because the older
  formatter removed required TypeScript property separators. Formatting does
  not change the exported UI or business rules.
- Fixed the desktop outside-click listener closing the mobile More sheet
  before menu item clicks could navigate. Mobile sheets retain their own
  backdrop dismissal and keyboard handling.
- Constrained the main grid to one shrinkable column so the Money page's
  transaction rows cannot widen the page on mobile.
- Verified onboarding validation, password visibility, all exported onboarding
  steps, dashboard, guided-tour dismissal, expense validation/save, goal
  creation, purchase reflection and analysis, waiting-list save, History,
  Insights, settings, language switching, and reset-dialog cancellation.
- Verified browser-local transactions, goals, and decisions survive reload.
- Checked desktop (1440px), tablet (768px), and mobile (375px) widths. The
  dashboard and corrected Money layout have no horizontal page overflow.
- `npm run typecheck`, `npm run build`, and `npm run format:check` pass.
  No semantic lint command is supplied by the export. Dependency installation
  reported zero vulnerabilities.

Remaining limitations inherited from the export: authentication is local-only,
data does not sync across devices, and Google Fonts requires network access
(the design includes fallback fonts). No working backend functionality was
replaced with mocks. The browser verification used a separate local origin on
port 5176 and created test-only entries there.
