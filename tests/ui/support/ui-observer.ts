import { expect, type Page, type TestInfo } from "@playwright/test";

export type ConsoleRecord = {
  type: string;
  text: string;
  location?: string;
  pageUrl?: string;
};

export type NetworkRecord = {
  url: string;
  method: string;
  status?: number;
  failure?: string;
  pageUrl?: string;
};

export type UiObservation = {
  consoleErrors: ConsoleRecord[];
  networkFailures: NetworkRecord[];
};

const IGNORED_CONSOLE_PATTERNS = [
  /favicon/i
];

export function attachUiObserver(page: Page): UiObservation {
  const observation: UiObservation = {
    consoleErrors: [],
    networkFailures: []
  };

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    const location = formatLocation(message.location());
    if (isIgnoredConsoleError(text, location)) {
      return;
    }
    observation.consoleErrors.push({
      type: message.type(),
      text,
      location,
      pageUrl: page.url()
    });
  });

  page.on("pageerror", (error) => {
    observation.consoleErrors.push({
      type: "pageerror",
      text: error.message,
      pageUrl: page.url()
    });
  });

  page.on("requestfailed", (request) => {
    observation.networkFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || "request failed",
      pageUrl: page.url()
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) {
      return;
    }
    observation.networkFailures.push({
      url: response.url(),
      method: response.request().method(),
      status,
      pageUrl: page.url()
    });
  });

  return observation;
}

export async function attachObservation(testInfo: TestInfo, name: string, observation: UiObservation) {
  await testInfo.attach(name, {
    body: JSON.stringify(observation, null, 2),
    contentType: "application/json"
  });
}

export function seriousConsoleErrors(observation: UiObservation) {
  return observation.consoleErrors.filter((item) => {
    return !isIgnoredConsoleError(item.text, item.location);
  });
}

export function failedNetworkRequests(observation: UiObservation) {
  return observation.networkFailures.filter((item) => {
    if (item.status === 404 && /favicon\.ico/i.test(item.url)) {
      return false;
    }
    return true;
  });
}

export async function expectPageNotBlank(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).toBeVisible();
  const bodyText = (await page.locator("body").innerText()).trim();
  expect(bodyText.length, "body text should not be empty").toBeGreaterThan(0);
  const visibleElementCount = await page.locator("body *:visible").count();
  expect(visibleElementCount, "page should have visible elements").toBeGreaterThan(3);
}

export async function expectNoStuckLoading(page: Page) {
  await page.waitForTimeout(800);
  const loadingOnly = await page.evaluate(() => {
    const body = document.body;
    const text = body?.innerText?.trim() || "";
    const visibleCount = Array.from(document.querySelectorAll("body *")).filter((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    }).length;
    return /^(loading|加载中|正在加载)/i.test(text) && visibleCount <= 3;
  });
  expect(loadingOnly, "page should not be stuck on a loading-only state").toBe(false);
}

export async function waitForAppReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => {
    const status = document.querySelector("#statusLine")?.textContent?.trim() || "";
    const hasTicker = document.querySelectorAll(".ticker-button").length > 0;
    if (hasTicker) {
      return true;
    }
    if (/加载失败|未找到 analysis-result|没有 ticker|个 ticker/.test(status)) {
      return true;
    }
    return false;
  }, null, { timeout: 10000 }).catch(() => {});
}

export async function captureNamedScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const fileName = `${safeName(testInfo.project.name)}-${safeName(name)}.png`;
  await page.screenshot({
    path: testInfo.outputPath(fileName),
    fullPage: true
  });
  await testInfo.attach(`${name} screenshot`, {
    path: testInfo.outputPath(fileName),
    contentType: "image/png"
  });
}

export async function discoverCoreLinks(page: Page) {
  return page.locator("a[href], button, [role=button], input, select, textarea");
}

export async function findTickerButton(page: Page) {
  const tickerButton = page.locator(".ticker-button").first();
  if (await tickerButton.count()) {
    return tickerButton;
  }
  return null;
}

export async function recordFinding(testInfo: TestInfo, finding: Record<string, unknown>) {
  await testInfo.attach("ui-finding", {
    body: JSON.stringify(finding, null, 2),
    contentType: "application/json"
  });
}

function formatLocation(location: { url?: string; lineNumber?: number; columnNumber?: number }) {
  if (!location.url) {
    return undefined;
  }
  const line = location.lineNumber ? `:${location.lineNumber}` : "";
  const column = location.columnNumber ? `:${location.columnNumber}` : "";
  return `${location.url}${line}${column}`;
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "artifact";
}

function isIgnoredConsoleError(text: string, location?: string) {
  const target = `${text}\n${location || ""}`;
  return IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(target));
}
