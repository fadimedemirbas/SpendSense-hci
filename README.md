# spendsense-hci
HCI course project for reflective spending decisions and personal goal awareness.

The official frontend is the Figma Make export in `frontend/`.

```sh
cd frontend
npm ci
npm run dev
```

Configure the project URL and Publishable Key in `frontend/.env.local` using
`frontend/.env.example`. See [Supabase integration setup](supabase/README.md)
for the proposed schema, Auth settings, and approval requirements. No remote
migrations are run automatically.

Checks: `npm test`, `npm run typecheck` and `npm run build`. The export has no lint script;
`npm run format:check` checks formatting. Run `npm run preview` to serve a build.

Financial records now use authenticated Supabase persistence, with no demo-data
fallback. The latest Figma Make export remains the only frontend. The earlier
[frontend replacement report](docs/frontend-migration.md) documents the state at
that migration; the Supabase setup describes the current data integration.

Before publishing, follow the [GitHub upload checklist](docs/github-upload-readiness.md).
The [responsive PWA release guide](docs/mobile-production-readiness.md) covers
Vercel configuration, mobile installation, and device acceptance checks.
