import { expect, test } from "@playwright/test";
import {
  attachObservation,
  attachUiObserver,
  captureNamedScreenshot,
  expectNoStuckLoading,
  expectPageNotBlank,
  recordFinding,
  waitForAppReady
} from "./support/ui-observer";

test("投资分析核心流程：搜索标的、打开详情、查看报告和附件区域", async ({ page }, testInfo) => {
  const observation = attachUiObserver(page);

  await page.goto("/");
  await waitForAppReady(page);
  await expectPageNotBlank(page);

  const search = page.locator("#tickerSearch");
  const tickerButtons = page.locator(".ticker-button");
  if ((await tickerButtons.count()) === 0) {
    await recordFinding(testInfo, {
      priority: "P1",
      page: "/",
      issue: "未发现股票/资产列表入口",
      expected: "页面应展示至少一个可打开的 ticker 或明确空状态",
      actual: "未找到 .ticker-button",
      suggestion: "实现 Agent 检查 analysis-result 数据加载、列表渲染和空状态。"
    });
    throw new Error("未发现股票/资产列表入口，不能伪造核心投资流程通过。");
  }

  const firstTickerText = (await tickerButtons.first().innerText()).split(/\s+/)[0]?.trim();
  expect(firstTickerText, "first ticker text should be readable").toBeTruthy();

  await search.fill(firstTickerText);
  await expect(tickerButtons.first()).toBeVisible();
  await tickerButtons.first().click();

  await expect(page.locator("#selectedTicker")).toContainText(firstTickerText);
  await expect(page.locator("#stageSummary")).toBeVisible();
  await expect(page.locator("#markdownContent")).toBeVisible();
  await expectNoStuckLoading(page);

  const chartOrAttachment = page.locator(".attachment-image, .attachment-row, .attachments-panel, #markdownContent table, #markdownContent pre");
  if ((await chartOrAttachment.count()) === 0) {
    await recordFinding(testInfo, {
      priority: "P1",
      page: page.url(),
      issue: "未发现图表、附件或结构化分析内容容器",
      expected: "详情页应至少展示报告正文、附件、图表或基础信息区域之一",
      actual: "未找到附件、图片、表格、代码块等可验证内容",
      suggestion: "实现 Agent 检查详情页数据绑定和图表/附件渲染入口。"
    });
    throw new Error("详情页缺少可验证的图表/附件/结构化内容。");
  }

  await captureNamedScreenshot(page, testInfo, "investment-flow");
  await attachObservation(testInfo, "console-network-observation", observation);
});
