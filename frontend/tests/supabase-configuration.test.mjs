import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { validateSupabaseConfiguration } from "../src/lib/supabaseConfiguration.ts";

test("configuration requires a valid URL and a browser publishable key", () => {
  assert.equal(
    validateSupabaseConfiguration("https://example.supabase.co", "sb_publishable_testonly"),
    null,
  );
  assert.ok(validateSupabaseConfiguration("https://", "sb_publishable_testonly"));
  assert.ok(validateSupabaseConfiguration(undefined, undefined));
  assert.ok(validateSupabaseConfiguration("https://example.supabase.co", "sb_secret_testonly"));
  assert.ok(
    validateSupabaseConfiguration("https://example.supabase.co", "eyJ_test_only_legacy_key"),
  );
  assert.ok(
    validateSupabaseConfiguration(
      "https://user:password@example.supabase.co",
      "sb_publishable_testonly",
    ),
  );
  assert.ok(
    validateSupabaseConfiguration(
      "https://example.supabase.co",
      "sb_publishable_replace_with_your_project_key",
    ),
  );
});

test("Vite refuses secret keys before producing a frontend bundle", () => {
  const secret = "sb_secret_TEST_ONLY_DO_NOT_BUNDLE";
  const build = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
    encoding: "utf8",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: secret,
    },
  });
  assert.notEqual(build.status, 0);
  assert.match(build.stdout + build.stderr, /Supabase configuration rejected/);
  assert.doesNotMatch(build.stdout + build.stderr, new RegExp(secret));
});
