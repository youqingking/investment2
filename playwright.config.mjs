import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.UI_TEST_BASE_URL || "http://127.0.0.1:8765";
const runId = process.env.UI_TEST_RUN_ID || "local";
const reportDir = process.env.UI_TEST_REPORT_DIR || `.ui-test-reports/${runId}`;
const browserChannel = process.env.UI_TEST_BROWSER_CHANNEL || (process.platform === "win32" ? "chrome" : undefined);

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 45000,
  expect: {
    timeout: 7000
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: `${reportDir}/test-results`,
  reporter: [
    ["list"],
    ["json", { outputFile: `${reportDir}/playwright-results.json` }],
    ["html", { outputFolder: `${reportDir}/html-report`, open: "never" }]
  ],
  use: {
    baseURL,
    channel: browserChannel,
    actionTimeout: 10000,
    navigationTimeout: 20000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 5"]
      }
    }
  ]
});
