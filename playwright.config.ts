import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [
    ["list"],
    ["json", { outputFile: "docs/test-results/browser.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm start",
      url: "http://127.0.0.1:3000/login",
      reuseExistingServer: false,
      timeout: 30000,
      env: { APP_ORIGIN: "http://127.0.0.1:3000" },
    },
    {
      command: "node --import tsx tests/ui-server.ts",
      url: "http://127.0.0.1:4401",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
