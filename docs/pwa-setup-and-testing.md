# SpendSense PWA setup and testing

SpendSense's existing React/Vite frontend is now installable and can load its
application shell offline. The Figma Make screens, navigation, animations,
onboarding, financial calculations and Supabase RPC protocol are retained.
No database tables, RLS policies, migrations, or remote settings were changed.

## Files and dependencies

| File | Purpose |
| --- | --- |
| `frontend/vite.config.ts` | `vite-plugin-pwa`, generated manifest, explicit static precache |
| `frontend/src/sw.ts` | Workbox worker; network-only API/cross-origin routes, static shell fallback |
| `frontend/src/pwa/policy.ts` | Shared cache bypass rules |
| `frontend/src/pwa/Pwa.tsx` | English/Turkish offline privacy, install events, consent-based updates |
| `frontend/src/pwa/network.ts` | Connectivity guard and request tracking to prevent reload during saves |
| `frontend/src/App.tsx`, `src/lib/useWorkspace.ts` | Connect guards without changing Auth methods or financial persistence |
| `frontend/src/Onboarding.tsx` | Reuse existing install button/help with global install handling |
| `frontend/src/main.tsx`, `src/index.css` | Local copies of existing font families and PWA status styling |
| `frontend/index.html`, `src/vite-env.d.ts` | Apple metadata/icon and PWA TypeScript definitions |
| `frontend/public/icons/*.png`, `scripts/generate-icons.mjs` | Existing `icon.svg` rendered at required sizes |
| `frontend/playwright.config.ts`, `e2e/pwa.spec.ts`, `scripts/pwa-test-server.mjs` | Isolated browser tests |
| `frontend/tests/pwa-policy.test.mjs` | Cache bypass and offline request guard tests |

Removed the export's no-op `public/sw.js` and SVG-only `public/manifest.webmanifest`.
Vite now generates the manifest and worker into `dist/`. The original `icon.svg`
and favicon remain; no substitute visual identity was introduced. Icons are
192×192, 512×512, maskable 512×512 (padded safe zone), and Apple 180×180 PNGs.

Installed development dependencies: `vite-plugin-pwa`, `workbox-core`,
`workbox-precaching`, `workbox-routing`, `workbox-strategies`, `@resvg/resvg-js`,
and `@playwright/test`. Existing design fonts are bundled through
`@fontsource/bricolage-grotesque`, `@fontsource/fraunces`, `@fontsource/gabarito`,
and `@fontsource/fredoka`, with Latin and Turkish/Latin extended coverage.
The npm lockfile records versions. Font packages include their license files.

## Cache and privacy contract

- Only build-generated HTML, JavaScript, CSS, local fonts, manifest and icons
  enter the Workbox precache. There is no runtime response caching.
- Supabase Auth/REST/RPC, API paths, requests with Authorization headers,
  token-bearing callbacks, and all cross-origin requests bypass caches. Network
  routes also use HTTP `cache: no-store`. There is no background synchronization.
- No financial records or access tokens are written to Cache Storage, IndexedDB,
  or another offline store by this PWA. Supabase's existing session persistence
  still uses its normal Auth storage; this integration does not change Auth
  behavior or claim to remove Supabase's session tokens while signed in.
- When offline, the app hides and makes inert the existing UI. Drafts may remain
  only in the current tab's memory, but financial information is not presented
  as current. Supabase operations are blocked before dispatch. An in-flight
  request can still have reached the server; reconnecting always requires a
  confirmed reload and fresh read rather than retrying a financial write.
- Reconnection does not automatically expose the old workspace. The user chooses
  **Reconnect and reload**. The same guard applies to a back/forward-cache restore.
- Logout retains the existing `signOut({ scope: 'local' })` behavior and unmounts
  the user's workspace. The cached shell contains no account records. Offline
  logout is unavailable along with other connectivity-dependent actions; the
  privacy screen remains visible until reconnection/reload.

## Local development and verification

Use Node.js 22.18+ and run from `frontend/`:

```sh
npm ci
npm run icons       # only needed after changing the source icon
npm test
npm run typecheck
npm run format:check
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/`. Service workers are deliberately disabled for
`npm run dev`; use the production build/preview for PWA testing. Visit online
once and reload after worker installation before testing an offline reload.
An entirely new device cannot bootstrap the shell while already offline.

`npm run test:pwa` builds to ignored `.pwa-test-dist/` using a disposable loopback
API at port 4180, serves that build on port 4179, and launches headless Chrome.
It never contacts the real Supabase project. Chrome must be installed (or change
the Playwright `channel` to your installed browser). Both ports must be free.
This browser fixture is test-only, holds its records in RAM, and is not used by
normal builds. Actual PostgreSQL persistence/RLS remains covered by `npm test`.

Browser coverage: manifest/icon dimensions, worker registration/control, offline
reload, API cache exclusion, Turkish mobile layout/keyboard access, manual iOS
help, install dismissal, confirmed updates with unfinished forms in two tabs,
and the existing Supabase SDK login/save/reload/logout flow against the local API.

Final local results: **33 unit/PostgreSQL tests and 5 headless Chrome browser
tests passed**. TypeScript, production build, formatting, and whitespace checks
passed. The generated worker precaches 32 static entries (about 851 KiB).
Npm reported zero vulnerabilities after dependency installation.

Manual checks against an approved, configured Supabase deployment:

1. Confirm the manifest and active worker in browser DevTools → Application.
2. Log in; create/edit an entry and goal, analyze a purchase, save a decision,
   then reload to confirm persistence. Check failed requests do not show success.
3. Enable Offline in DevTools: financial content is hidden, writes/login are
   unavailable, and the shell still loads after refresh. Inspect Cache Storage:
   only static build assets should appear, never `/auth/v1`, `/rest/v1`, RPC
   responses, account email, token responses or transaction records.
4. Return online: stale content stays hidden until confirmed reload. Verify the
   latest server values load. Log out and reload/back; no old records should show.
5. Deploy a new build while two tabs hold unfinished inputs. Both should offer
   an update; **Later** keeps the form. **Update** requires confirmation, is
   unavailable while a request is running, and reloads only the consenting tab.
6. Test keyboard focus and screen-reader status announcements; test 390px mobile,
   tablet, desktop, and 200% zoom. New PWA controls use existing 48px buttons and
   visible focus styles; ink on cream exceeds AA text contrast. This is not a
   certification that every pre-existing screen satisfies all WCAG criteria.

## Install

**Android / desktop Chrome or Edge:** open the HTTPS site, choose the existing
**Install app** button when offered, and confirm the browser dialog. If the
browser does not offer installation, **How to install** opens the existing help.
No dialog opens automatically. A native dismissal suppresses the app-triggered
native prompt for 30 days; manual instructions remain available. Browser/OS
installation UI and eligibility are controlled by that browser.

**iPhone / iPad:** open in Safari → Share → **Add to Home Screen** → **Add**.
Choose the iPhone/iPad tab in the existing help for instructions. iOS does not
provide the Chromium `beforeinstallprompt` API. Standalone mode hides the install
button. Installing on one device does not install on another.

## Deploy

1. Configure only the existing public `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` in the build environment; never a secret key.
   Do not upload `.env.local`. The publishable key and URL are public client
   configuration by design; never log or publish secret environment values.
2. Run `npm ci` and `npm run build`; deploy **only `frontend/dist/`**, never
   `.pwa-test-dist/`, to HTTPS at the origin root. Keep the existing Supabase Auth
   allowed origins/redirects configured for the deployed site.
3. Serve `/sw.js`, `/index.html`, and `/manifest.webmanifest` with revalidation
   (`Cache-Control: no-cache`); hashed `/assets/*` can use a long immutable cache.
   Serve real JavaScript/manifest MIME types; never rewrite worker/asset/API 404s
   to HTML. SPA rewrites apply only to application navigation. The worker's
   offline navigation fallback covers the existing root-based application.
4. Deploy atomically and retain prior hashed assets during rollout for open old
   tabs. New workers wait for user consent, except normal browser activation
   after all old tabs close. Do not configure auto-update or unconditional reload.
5. Perform the device and authenticated manual checks above before release.

## Limits

Offline financial viewing, writes, synchronization, and push notifications are
intentionally absent. `navigator.onLine` is a connectivity hint, not proof the
Supabase server is reachable; server outages use the existing error/reload flow.
An update or offline recovery reload discards unsaved inputs only after explicit
confirmation. Browser-wide clearing of site data removes the static shell and
install-dismissal preference. Device-level installation requires manual testing
on Android/iOS; headless tests cannot install an app into a real OS home screen.
Live Supabase project configuration, real email delivery and credentials were
not exercised by the isolated browser tests. The build may retain the existing
large-bundle warning and a plugin-generated `inlineDynamicImports` deprecation
notice; neither blocks PWA generation.

References: [Vite PWA custom worker](https://vite-pwa-org.netlify.app/guide/inject-manifest),
[Workbox routing](https://developer.chrome.com/docs/workbox/reference/workbox-routing).
