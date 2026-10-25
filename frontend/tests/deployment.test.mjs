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
