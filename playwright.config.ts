import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { FIXTURE_PORT } from "./e2e/constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    trace: "on-first-retry",
  },
  webServer: {
    command: `node ${path.join(__dirname, "e2e", "fixtures-server.mjs")}`,
    port: FIXTURE_PORT,
    reuseExistingServer: !process.env.CI,
  },
});
