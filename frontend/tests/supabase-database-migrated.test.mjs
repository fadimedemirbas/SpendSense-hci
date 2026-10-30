// Runs every assertion of supabase-database.test.mjs, unchanged, against a database
// with the currency migration applied on top of migration 1: protocol 1 clients
// (today's frontend) must see exactly the behaviour they rely on.
globalThis.SPENDSENSE_EXTRA_MIGRATIONS = ["202610280001_spendsense_currency.sql"];
await import("./supabase-database.test.mjs");
