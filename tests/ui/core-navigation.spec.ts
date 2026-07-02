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

test("主要导航项、筛选器和阶段 Tab 可交互", async ({ page }, testInfo) => {
  const observation = attachUiObserver(page);

  await page.goto("/");
  await waitForAppReady(page);
  await expectPageNotBlank(page);

  const filterButtons = page.locator(".filter-button");
  const filterCount = await filterButtons.count();
  expect(filterCount, "status filters should be discoverable").toBeGreaterThan(0);
  for (let index = 0; index < Math.min(filterCount, 4); index += 1) {
    await filterButtons.nth(index).click();
    await expectNoStuckLoading(page);
  }

  const tickerButtons = page.locator(".ticker-button");
  if ((await tickerButtons.count()) === 0) {
    testInfo.annotations.push({
      type: "ui-warning",
      description: "未发现 ticker 入口；可能没有 analysis-result 数据或列表渲染失败。"
    });
  } else {
    await tickerButtons.first().click();
    await expect(page.locator("#reportView")).toBeVisible();
  }

  const stageTabs = page.locator(".stage-tab");
  const stageCount = await stageTabs.count();
  if (stageCount === 0) {
    testInfo.annotations.push({
      type: "ui-warning",
      description: "未发现阶段 Tab；可能未选中 ticker 或页面结构变化。"
    });
  }
  for (let index = 0; index < Math.min(stageCount, 4); index += 1) {
    await stageTabs.nth(index).click();
    await expectNoStuckLoading(page);
    await expectPageNotBlank(page);
  }

  await captureNamedScreenshot(page, testInfo, "core-navigation");
  await attachObservation(testInfo, "console-network-observation", observation);

  expect(seriousConsoleErrors(observation), "no serious console/runtime errors during navigation").toEqual([]);
  expect(failedNetworkRequests(observation), "no failed 4xx/5xx network requests during navigation").toEqual([]);
});
