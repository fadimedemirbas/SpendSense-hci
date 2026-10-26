import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vercel fallbacks exclude missing static files and APIs and revalidate the worker", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const fallback = new RegExp("^" + config.rewrites[0].source + "$");
  for (const route of ["/", "/dashboard", "/goals"]) assert.ok(fallback.test(route));
  for (const route of [
    "/sw.js",
    "/assets/missing.js",
    "/icons/missing.png",
    "/manifest.webmanifest",
    "/api/data",
    "/auth/v1/token",
    "/rest/v1/rpc/save",
  ])
    assert.equal(fallback.test(route), false, route);
  assert.equal(config.outputDirectory, "dist");
  const worker = config.headers.find((rule) => rule.source === "/sw.js");
  assert.match(worker.headers.find((header) => header.key === "Cache-Control").value, /no-cache/);
});

// Minimal reader for the flat [[headers]]/[[redirects]] tables used in netlify.toml.
function netlifyTables(source, name) {
  return source
    .split(/^\[\[/m)
    .filter((block) => block.startsWith(`${name}]]`))
    .map((block) =>
      Object.fromEntries(
        [...block.matchAll(/^\s*([\w-]+)\s*=\s*(?:"([^"]*)"|(\d+))/gm)].map((m) => [
          m[1],
          m[2] ?? Number(m[3]),
        ]),
      ),
    );
}

test("Netlify builds frontend/dist and only rewrites missing app routes to index.html", async () => {
  const source = await readFile(new URL("../../netlify.toml", import.meta.url), "utf8");
  assert.match(source, /^\s*base\s*=\s*"frontend"/m);
  assert.match(source, /^\s*command\s*=\s*"npm run build"/m);
  assert.match(source, /^\s*publish\s*=\s*"dist"/m);
  assert.doesNotMatch(source, /sb_secret_|service_role|VITE_SUPABASE_\w+\s*=/i);

  const redirects = netlifyTables(source, "redirects");
  // Netlify matches top to bottom; emulate it for unforced rules on missing files.
  const resolve = (path) =>
    redirects.find((rule) => {
      const prefix = rule.from.replace(/\*$/, "");
      return rule.from.endsWith("*") ? path.startsWith(prefix) : path === rule.from;
    });
  for (const route of ["/", "/dashboard", "/goals"]) {
    assert.deepEqual([resolve(route)?.to, resolve(route)?.status], ["/index.html", 200], route);
  }
  for (const route of [
    "/assets/missing.js",
    "/icons/missing.png",
    "/api/data",
    "/auth/v1/token",
    "/rest/v1/rpc/save",
    "/rpc/save",
  ])
    assert.equal(resolve(route)?.status, 404, route);
  assert.ok(redirects.every((rule) => !rule.force));

  const headers = netlifyTables(source, "headers");
  const worker = source.slice(source.indexOf('for = "/sw.js"'));
  assert.ok(headers.some((rule) => rule.for === "/sw.js"));
  assert.match(worker.slice(0, 200), /Cache-Control = "no-cache/);
});
