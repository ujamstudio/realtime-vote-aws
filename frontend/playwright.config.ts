import { defineConfig, devices } from "@playwright/test";

// E2E suite for the deployed MT Vote site. Tests run sequentially because
// they share global server state (the active round).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "https://d1tozply96gew4.cloudfront.net",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-voter",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
