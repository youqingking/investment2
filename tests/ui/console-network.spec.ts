import { expect, test } from "@playwright/test";
import {
  attachObservation,
  attachUiObserver,
  expectNoStuckLoading,
  expectPageNotBlank,
  failedNetworkRequests,
  waitForAppReady,
  seriousConsoleErrors
} from "./support/ui-observer";

test("捕获 console error、runtime error、failed request 和 4xx/5xx", async ({ page }, testInfo) => {
  const observation = attachUiObserver(page);

  await page.goto("/");
  await waitForAppReady(page);
  await expectPageNotBlank(page);
  await expectNoStuckLoading(page);

  const tickerButtons = page.locator(".ticker-button");
  if ((await tickerButtons.count()) > 0) {
    await tickerButtons.first().click();
    const tabs = page.locator(".stage-tab");
    for (let index = 0; index < Math.min(await tabs.count(), 4); index += 1) {
      await tabs.nth(index).click();
      await page.waitForTimeout(300);
    }
  }

  await attachObservation(testInfo, "console-network-observation", observation);

  expect(seriousConsoleErrors(observation), "console/runtime errors should be empty").toEqual([]);
  expect(failedNetworkRequests(observation), "network 4xx/5xx and failed requests should be empty").toEqual([]);
});
