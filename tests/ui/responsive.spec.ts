import { expect, test } from "@playwright/test";
import {
  attachObservation,
  attachUiObserver,
  captureNamedScreenshot,
  expectNoStuckLoading,
  expectPageNotBlank,
  waitForAppReady
} from "./support/ui-observer";

test("核心页面在当前 viewport 下无明显白屏或全局溢出", async ({ page }, testInfo) => {
  const observation = attachUiObserver(page);

  await page.goto("/");
  await waitForAppReady(page);
  await expectPageNotBlank(page);
  await expectNoStuckLoading(page);

  const layoutHealth = await page.evaluate(() => {
    const body = document.body;
    const doc = document.documentElement;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const main = document.querySelector("main, .layout, #reportView");
    const mainRect = main?.getBoundingClientRect();
    return {
      viewportWidth,
      viewportHeight,
      bodyTextLength: body.innerText.trim().length,
      horizontalOverflow: doc.scrollWidth - viewportWidth,
      mainVisible: Boolean(mainRect && mainRect.width > 0 && mainRect.height > 0)
    };
  });

  await testInfo.attach("responsive-layout-health", {
    body: JSON.stringify(layoutHealth, null, 2),
    contentType: "application/json"
  });
  await captureNamedScreenshot(page, testInfo, "responsive");
  await attachObservation(testInfo, "console-network-observation", observation);

  expect(layoutHealth.mainVisible, "main content should be visible").toBe(true);
  expect(layoutHealth.bodyTextLength, "page should contain readable text").toBeGreaterThan(0);
  expect(layoutHealth.horizontalOverflow, "horizontal overflow should be limited").toBeLessThanOrEqual(32);
});
