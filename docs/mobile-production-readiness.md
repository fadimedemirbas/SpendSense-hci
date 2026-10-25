# SpendSense responsive PWA release guide

This extends the existing Figma Make React application. The visual identity,
desktop 880px workspace/landing layout, animations, current Auth methods, Supabase
RPC protocol, Windows installation, and financial features are retained. No
database schema, migration, RLS policy, remote setting, or backend code changed.
Nothing was committed, pushed, or deployed.

## Implementation

| Files | Changes |
| --- | --- |
| `frontend/src/index.css` | Intrinsic sizing/wrapping, comfortable mobile inputs, safe areas, compact entry actions, dynamic-height scrollable dialogs, short-screen PWA notices, reduced motion, AA green badge/step text contrast |
| `frontend/src/ui.tsx` | Modal focus trapping/inert background/scroll restoration, keyboard-operable segmented groups, translated accessible labels, bounded progressbar values, linked validation feedback |
| `frontend/src/Shell.tsx` | Mobile back control, skip link, named navigation, active states, keyboard dropdown control; render only the correct mobile/desktop More menu |
| `frontend/src/context.ts`, `src/SignedIn.tsx` | In-memory tab history, focus moved to the new screen, translated loading/error/save statuses |
| `frontend/src/App.tsx`, `src/SignedIn.tsx` | Existing signed-in implementation extracted unchanged in responsibility and lazy-loaded, with translated chunk-load error recovery; no second frontend |
| `frontend/src/Onboarding.tsx` | Translation-aware language labels, iPad detection, mobile-safe layout, email input hints, associated errors, synchronous repeated-submit guard |
| `frontend/src/Money.tsx`, `src/Decide.tsx`, `src/Pages.tsx` | Two-column category grids below 400px, flexible analysis summaries, mobile entry controls, goal errors and reflection labels |
| `frontend/src/lib/useWorkspace.ts` | Reject repeat save clicks synchronously before the native disabled state renders; preserve revision checks and server-confirmed success |
| `frontend/src/pwa/Pwa.tsx` | Throttle foreground worker-update checks; preserve explicit update confirmation and privacy-first offline handling |
| `frontend/vercel.json` | Root-hosted Vite build, revalidated worker/manifest/HTML, immutable hashed assets, SPA fallback excluding assets and API paths |
| `frontend/e2e/responsive.spec.ts`, `playwright.config.ts` | Requested width matrix, mobile/landscape journeys, keyboard checks, axe WCAG checks |
| `frontend/scripts/pwa-test-server.mjs` | Test-only data seeding/registration fixture and portable filesystem paths; never imported into production |
| `frontend/tests/deployment.test.mjs`, `package.json`, `package-lock.json` | Deployment routing tests and `@axe-core/playwright` development dependency |

At 320/360/375/390/430px, category choices reflow instead of squeezing four
columns; entry actions have their own row. Tablet sizes 768/1024px retain flexible
grids; 1280/1440/1920px retain the desktop presentation. Narrow text, large values,
Turkish labels and charts can wrap/shrink without globally hiding overflow.
Dialogs scroll within the visual viewport and account for cutouts and safe areas.
Mobile back returns to the previous tab; existing wizard Back/Cancel controls
remain. Tab history is held only in RAM and does not store financial records.

The main bundle decreases from approximately 550kB to approximately 499kB before
gzip; the 57kB signed-in chunk parses when authenticated. All chunks remain in
the existing static precache for offline shell loading. Update checks are limited
to at most every 15 minutes on foreground/connectivity events, plus the existing
hourly timer. There is no per-route data fetch or new financial cache.

## HCI and accessibility

- Existing loading/error feedback remains; a screen-reader save status announces
  pending changes. Buttons and the synchronous save guard prevent double submits.
- Financial records become visible only after load, and writes report success
  only after Supabase confirms them. Stale revisions and failures retain the
  existing recovery flow; no offline writes are queued or synchronized.
- Navigation and progress have accessible names; a skip link and focus movement
  identify screen changes. Active navigation uses `aria-current`.
- Segmented radio controls support arrows, Home/End, roving tab stops and checked
  states. Desktop menus support ArrowUp/Down and Escape.
- Dialogs trap focus, restore it to the trigger, lock background scrolling and
  make background controls inert. Only the viewport-appropriate menu mounts.
- Existing focus outlines, English/Turkish translations, and reduced-motion
  behavior remain. New controls use the established 44–48px touch sizes; mobile
  inputs are at least 16px to avoid unwanted iOS input zoom.
- Green foreground text on pale-green badges/completed steps uses a darker shade
  in the same palette to fix a measured AA contrast failure; the base brand colors
  and component shapes remain unchanged.
- Automated WCAG AA checks supplement keyboard tests. They are not a complete
  WCAG certification; screen-reader and physical-device review remain necessary.

## Verification commands

Use Node.js 22.18+ and run from `frontend/`:

```sh
npm ci
npm test
npm run typecheck
npm run format:check
npm run build
npm run test:pwa
```

`test:pwa` launches installed desktop Chrome, a production build at port 4179,
and a disposable local Supabase-shaped API at port 4180. Both ports must be free.
The test build lives in ignored `.pwa-test-dist/` and uses test-only configuration.
Do not deploy it. No browser test writes to the real Supabase database. Unit tests
exercise the actual existing migration in disposable local PostgreSQL.

The browser suite covers all requested widths; income/expense screens, goals,
purchase analysis and decisions, waiting/reflections, profiles, onboarding,
registration/login/logout, navigation, offline privacy, install help, manifest,
worker control, API cache exclusion, and multi-tab update confirmation. Short
320×568 portrait, 844×390 landscape, and 1024×768 tablet form journeys supplement
the width matrix. Normal animations remain in production; deterministic browser
checks request reduced motion.

Final verification: **34/34 unit/PostgreSQL tests and 21/21 headless Chrome browser
tests passed**. TypeScript, production build, formatting and `git diff --check`
passed. Automated WCAG checks passed on Home, Money, Goals, Insights, Settings,
purchase entry, Waiting List and History. The main bundle is 499.89kB (147.63kB
gzip), with a separate 57.32kB signed-in chunk. Workbox precaches 33 safe static
entries; the only build warning is the upstream worker-build deprecation noted
below. `.env.local` remains ignored. These are local checks, not a claim that
Vercel, live Supabase or physical Android/iPhone installation was exercised.

## Vercel deployment — only after approval

1. Use the existing repository and Vercel **Vite** project. Set **Root Directory**
   to `frontend`. Do not create a replacement frontend or native mobile app.
2. Use **Install Command** `npm ci`, **Build Command** `npm run build`, and
   **Output Directory** `dist`. `frontend/vercel.json` contains the matching
   configuration. Select Node.js 22.18+ supported by the hosting environment.
3. In Vercel's environment configuration, set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` for the approved deployment environments using
   the existing project's public URL and publishable key. No database password,
   service-role key or secret key belongs in a `VITE_*` variable. `.env.local`
   remains ignored by Git. Rebuild after changing build-time values.
4. Have the project owner configure Supabase **Authentication → URL Configuration**:
   set **Site URL** to the final HTTPS origin. Add that origin and its root `/`
   URL to **Redirect URLs** to cover the current `window.location.origin` email
   confirmation callback. Keep development origins only where needed. For
   production prefer exact URLs; authorize preview domains individually or with
   a narrowly scoped team pattern rather than a general `*.vercel.app` wildcard.
   No automatic remote Auth configuration change is made by this work.
5. After approval, deploy `frontend/dist/` to the origin root over HTTPS. Do not
   deploy the repository, `.env.local`, or `.pwa-test-dist/` as public assets.
   Existing filesystem assets take priority; extensionless app paths fall back
   to `index.html`, while missing assets, `/sw.js`, manifest and API endpoints
   cannot silently return HTML. The existing UI uses in-memory tabs; an arbitrary
   deep link loads the shell, not a new URL-based navigation system.
6. Verify response headers: `/sw.js`, `/manifest.webmanifest`, `/index.html` and
   `/` revalidate; `/assets/*` may use a one-year immutable cache. Verify real
   JavaScript and manifest MIME types. Do not enable an automatic worker update
   strategy. Use atomic deployments and retain old hashed assets during rollout.
7. Sign in with two test users in separate browser profiles and check only owned
   records load. Save income/expense/goals/decisions, reload, log out, and verify
   old data is not shown. Confirm the existing RLS on the approved deployment;
   do not change policies or rerun migrations as part of deployment.
8. Confirm the static-only Cache Storage contents, offline/reconnect privacy,
   waiting-worker Update/Later controls, and Windows installation regression.
   Run the real-device checklist below before calling the mobile release complete.

## Install and real-device acceptance

**Android Chrome:** open the final HTTPS site, choose **Install app** when offered
(or Chrome's installation menu), confirm installation, launch from the home screen
and sign in. Test portrait/landscape, keyboard opening, back navigation, saving
an entry/goal/decision, and session persistence after closing/reopening the PWA.

**iPhone/iPad Safari:** open the final HTTPS site → Share → **Add to Home Screen**
→ **Add** (enable opening as a web app if Safari offers that option). Launch from
the home screen and sign in. The existing in-app install help includes iPhone/iPad
instructions. Verify icon, standalone chrome, safe areas, keyboard-obscured fields,
scrollable dialogs, orientation changes and session restoration on a real device.
Safari does not provide Chromium's native install-prompt event.

**Desktop/Windows:** retain the existing Chrome/Edge installation. Load the new
release, finish any open form, select **Update** and confirm. Verify navigation,
keyboard operation and a financial save; another tab must retain unfinished input.

Also test Android TalkBack and iOS VoiceOver, 200% text zoom, 320px-equivalent
content, a notched phone in landscape, slow/flaky networks and reconnect after an
uncertain save. Browser emulation cannot verify native OS installation prompts,
Safari storage/session lifecycle, actual safe-area hardware or mobile keyboards.

## Remaining limits

There is no offline financial storage/synchronization and no native application.
Only static assets are cached; Supabase Auth retains its existing session storage,
never tokens in the service worker cache. Connectivity is a browser hint; server
outages still use error recovery. Root `/` remains the existing offline navigation
entry point. Real Supabase configuration and physical-device installation are
release acceptance checks, not outcomes claimed from local test fixtures.
The Workbox/Vite integration may emit an upstream `inlineDynamicImports`
deprecation warning; it does not prevent building the worker.

References: [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite),
[Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json),
[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
