// Disposable browser-test backend only. Never imported by the application and
// never contacts the real Supabase project. SQL/RLS tests exercise actual PG.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
const vite = new URL("../node_modules/vite/bin/vite.js", import.meta.url);
const env = {
  ...process.env,
  VITE_SUPABASE_URL: "http://127.0.0.1:4180",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test_only",
};
const build = spawn(
  process.execPath,
  [fileURLToPath(vite), "build", "--outDir", ".pwa-test-dist"],
  { env, stdio: "inherit" },
);
const result = await new Promise((resolve) => build.on("exit", resolve));
if (result !== 0) process.exit(result ?? 1);
const user = {
  id: "3ad85db6-c1fb-4ad5-8f29-87cd481c9754",
  aud: "authenticated",
  role: "authenticated",
  email: "pwa-test@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test-only-signature`;
let workspace = {
  profile: {
    email: user.email,
    income: 1,
    savings: 1,
    habits: [0, 1, 2, 0],
    onboarded: true,
    currency: "symbol",
  },
  entries: [],
  goals: [],
  analyses: [],
  decisions: [],
  waiting: [],
};
let revision = 1;
const api = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4179");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ||
      "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url === "/__test/seed" && req.method === "POST") {
    workspace = JSON.parse(body);
    revision++;
    res.end("{}");
  } else if (req.url.startsWith("/auth/v1/signup"))
    res.end(JSON.stringify({ user, session: null }));
  else if (req.url.startsWith("/auth/v1/token"))
    res.end(
      JSON.stringify({
        access_token: jwt,
        refresh_token: "test-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      }),
    );
  else if (req.url.startsWith("/auth/v1/logout")) {
    res.end("{}");
  } else if (req.url.startsWith("/auth/v1/user")) res.end(JSON.stringify(user));
  else if (req.url === "/rest/v1/rpc/spendsense_load_workspace")
    res.end(JSON.stringify({ workspace, revision }));
  else if (req.url === "/rest/v1/rpc/spendsense_save_workspace") {
    const request = JSON.parse(body);
    if (request.expected_revision !== revision) {
      res.writeHead(409);
      res.end(JSON.stringify({ code: "40001" }));
      return;
    }
    const { ownerId, schemaVersion, deletions, behaviorScores, ...next } = request.payload;
    workspace = next;
    revision++;
    res.end(JSON.stringify(revision));
  } else {
    res.writeHead(404);
    res.end("{}");
  }
});
await new Promise((resolve) => api.listen(4180, "127.0.0.1", resolve));
const preview = spawn(
  process.execPath,
  [
    fileURLToPath(vite),
    "preview",
    "--outDir",
    ".pwa-test-dist",
    "--host",
    "127.0.0.1",
    "--port",
    "4179",
    "--strictPort",
  ],
  { env, stdio: "inherit" },
);
preview.on("exit", (code) => {
  api.close();
  process.exit(code ?? 0);
});
