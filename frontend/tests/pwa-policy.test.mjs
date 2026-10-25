import assert from "node:assert/strict";
import test from "node:test";
import { networkOnlyRequest } from "../src/pwa/policy.ts";
import { onlineOperation, pendingNetwork, subscribeNetwork } from "../src/pwa/network.ts";

test("API endpoints, cross-origin resources, bearer requests and token callbacks bypass caches", () => {
  const origin = "https://spendsense.example";
  for (const path of [
    "/auth/v1/token",
    "/rest/v1/entries",
    "/rest/v1/rpc/save",
    "/rpc/save",
    "/functions/v1/analyze",
    "/storage/v1/object/a",
    "/api/financial",
    "/?access_token=private",
    "/?code=auth-code",
  ]) {
    assert.equal(networkOnlyRequest(new URL(path, origin), origin, false), true, path);
  }
  assert.equal(
    networkOnlyRequest(new URL("https://other.example/assets/app.js"), origin, false),
    true,
  );
  assert.equal(networkOnlyRequest(new URL("/assets/app.js", origin), origin, true), true);
  assert.equal(networkOnlyRequest(new URL("/assets/app.js", origin), origin, false), false);
});

test("pending requests block reloads until success or failure and offline calls never reach the backend", async () => {
  const states = [];
  const unsubscribe = subscribeNetwork(() => states.push(pendingNetwork()));
  assert.equal(await onlineOperation(async () => 42), 42);
  await assert.rejects(
    onlineOperation(async () => {
      throw new Error("test failure");
    }),
  );
  assert.deepEqual(states, [1, 0, 1, 0]);
  unsubscribe();
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  let called = false;
  try {
    await assert.rejects(
      onlineOperation(async () => {
        called = true;
      }),
      /offline/,
    );
    assert.equal(called, false);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
});
