# Safe GitHub upload and Vercel handoff

This is the existing SpendSense repository. Its top-level application content is
`frontend/`, documentation is in `docs/`, and the prepared database proposal is in
`supabase/`. `.git/` contains Git metadata; `.migration-backups/` is local-only.
No separate mobile application or replacement frontend was created during this
upload preparation. No remote Supabase operation, commit, push or deployment was
performed.

## Repository audit

- Current branch: `develop`, tracking `origin/develop`. Existing `origin` is
  `https://github.com/fadimedemirbas/SpendSense-hci.git`; its URL contains no
  embedded HTTP credentials. Do not initialize another repository or replace it.
- The working tree contains the intentional Figma Make replacement and subsequent
  Supabase/PWA work: tracked modifications/deletions plus untracked new source,
  assets, tests, guides, SQL proposal and Vercel configuration. Nothing is staged.
  Pushing without staging and committing this work would not publish the changes.
- Existing deleted onboarding files belong to the superseded implementation;
  include those deletions in the final review rather than restoring the old UI.
- `frontend/.env.local` is ignored and is not in the index. `node_modules`, `dist`,
  local environment files, Vercel local metadata, test builds/reports, logs and
  backups are excluded. Root ignore rules now apply across the repository.
  `frontend/.env.example` remains eligible and contains placeholders only.
- The read-only `frontend/scripts/audit-publication.mjs` checks current files
  eligible for publication, the index, and blobs reachable from all local refs.
  It checks common Supabase secret/token, private-key, database URI, literal
  password and provider-token patterns without printing credential values.
  Known explicit test-only placeholders are allowed. This is a pattern-based
  audit, not a guarantee that every possible credential format is detectable.
- The initial scan found no credential matches in 110 reachable/index blobs
  across 17 reachable commits or the publication candidate files. Existing test
  credentials are synthetic and confined to tests/test infrastructure. Public
  project URLs and placeholder publishable keys are not service-role secrets.

## Required files

Publish root `.gitignore` and `README.md`, existing and new `docs/`, all current
frontend source/styles, `index.html`, `package.json` and `package-lock.json`,
`tsconfig.json`, `vite.config.ts`, `vercel.json`, `.env.example`, public icons,
PWA worker/provider/policy, local fonts' package dependencies, tests, Playwright
configuration and scripts. Include the reviewed `supabase/` proposal/documentation
as source files; uploading SQL never executes it. Do not upload `.env.local`,
generated builds or dependencies. The dependency lockfile permits `npm ci`.

`frontend/vercel.json` expects Vercel Root Directory **frontend**. Vite builds
with `npm run build` into `dist`. Existing files are served normally;
extensionless navigation can fall back to `/index.html`, while API paths and
missing asset/manifest/worker filenames are excluded from the HTML fallback.
Worker/HTML/manifest revalidate; hashed assets use immutable caching. The current
app uses in-memory tabs; this does not invent URL routes for those tabs.

Verification completed: `npm ci` and `npm run build` succeeded. Npm reported zero
vulnerabilities. Windows Vite file locks required temporarily stopping four
repository-specific development/preview servers; they were restored on ports
5173, 5174, 5176 and 4173 afterward. The build emits a non-blocking upstream
worker-build deprecation notice. No database or design changes were needed.

## Commands to review and publish later

Run these manually in PowerShell **only when you decide to commit and push**.
The new branch keeps review separate from the shared `develop` branch. Use a
different unused `codex/` branch name if this example already exists.

```powershell
Set-Location C:\Users\msi-nb\SpendSense-hci
git status --short --branch
git check-ignore -v frontend/.env.local frontend/node_modules frontend/dist
node frontend/scripts/audit-publication.mjs
if ($LASTEXITCODE -ne 0) { throw "Publication audit failed; do not publish." }

git switch -c codex/pwa-production-readiness
if ($LASTEXITCODE -ne 0) { throw "Branch creation failed; stop and review." }
git add --all
if ($LASTEXITCODE -ne 0) { throw "Staging failed; stop and review." }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "Staged whitespace check failed." }
node frontend/scripts/audit-publication.mjs
if ($LASTEXITCODE -ne 0) { throw "Staged publication audit failed." }
git diff --cached --stat
git diff --cached --name-status
git diff --cached
```

Review the staged source and intentional old-UI deletions. Confirm `.env.local`,
dependencies, local test output and generated build directories are absent; the
permanent PNG icons in `public/icons/` should be included. If the review
finds an unexpected staged file, unstage that specific path with
`git restore --staged -- path/to/file`; do not discard working files.

After approving that concrete staged diff:

```powershell
git commit -m "Prepare SpendSense responsive PWA for deployment"
if ($LASTEXITCODE -ne 0) { throw "Commit failed; do not push." }
git push -u origin codex/pwa-production-readiness
git status --short --branch
```

Do not use force push. Open a pull request into `develop` and review it with the
team. If Vercel is already connected, a Git push may trigger a preview or production
deployment according to its branch settings. Verify/disable automatic deployments
before pushing if deployment approval is still pending. No Vercel settings were
changed by this audit.

## Subsequent Vercel configuration

After deployment approval, use the existing repository, Root Directory
`frontend`, framework Vite, install `npm ci`, build `npm run build`, output `dist`,
and Node.js 22.18+ in a supported major version. Configure only
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel's intended
environments, using the existing Supabase project. Never configure a secret key,
service-role key or database password as a `VITE_*` variable. Build-time changes
require a new build. Configure the final HTTPS origin in Supabase Auth's Site URL
and redirect allowlist through the project owner's approved workflow.

See [mobile/PWA release and deployment steps](mobile-production-readiness.md)
for device acceptance, redirects and install instructions. No migration is run
automatically by `npm ci`, the build, or the Vercel configuration.
