import { expect, test } from "@playwright/test";
import {
  attachObservation,
  attachUiObserver,
  captureNamedScreenshot,
  expectNoStuckLoading,
  expectPageNotBlank,
  failedNetworkRequests,
  waitForAppReady,
  seriousConsoleErrors
} from "./support/ui-observer";

test("首页/入口页可加载且不是白屏", async ({ page }, testInfo) => {
  const observation = attachUiObserver(page);

  await page.goto("/");
  await waitForAppReady(page);
  await expectPageNotBlank(page);
  await expectNoStuckLoading(page);
  await expect(page.locator("main, [role=main], .layout, #dateList, #tickerList").first()).toBeVisible();
  await captureNamedScreenshot(page, testInfo, "home-loaded");
  await attachObservation(testInfo, "console-network-observation", observation);

  expect(seriousConsoleErrors(observation), "no serious console/runtime errors on home").toEqual([]);
  expect(failedNetworkRequests(observation), "no failed 4xx/5xx network requests on home").toEqual([]);
});
