import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4179",
    channel: "chrome",
    headless: true,
    reducedMotion: "reduce",
    actionTimeout: 10000,
  },
  webServer: {
    command: "node scripts/pwa-test-server.mjs",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
  },
});
